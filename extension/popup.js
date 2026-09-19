const byId = id => document.getElementById(id);
const config = await chrome.storage.local.get(['pairing', 'color']);
byId('pairing').value = config.pairing || '';
byId('color').value = config.color || 'w';
async function start(once) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.storage.local.set({ pairing: byId('pairing').value.trim(), color: byId('color').value });
  await chrome.runtime.sendMessage({ type: 'start', tabId: tab.id, color: byId('color').value, once });
}
byId('play').onclick = () => start(false).catch(error => { byId('status').textContent = error.message; });
byId('step').onclick = () => start(true).catch(error => { byId('status').textContent = error.message; });
byId('stop').onclick = () => chrome.runtime.sendMessage({ type: 'stop' });
function show(state) {
  if (!state) return;
  byId('status').textContent = state.status;
  byId('play').disabled = state.running;
  byId('step').disabled = state.running;
  const decision = state.lastDecision;
  byId('detail').textContent = decision ? `${decision.san} · confidence ${decision.confidence.toFixed(2)} · ${decision.elapsedMs} ms · ${state.history.length} half-moves` : '';
}
show((await chrome.storage.session.get('state')).state);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes.state) show(changes.state.newValue); });
