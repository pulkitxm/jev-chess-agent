const byId = id => document.getElementById(id);
fetch('/api/pairing').then(response => response.json()).then(data => { byId('pairing').value = data.token; });
byId('copy').onclick = async () => {
  await navigator.clipboard.writeText(byId('pairing').value);
  byId('copied').textContent = 'Copied. Paste this in the extension popup.';
};
async function refresh() {
  try {
    const data = await fetch('/api/status').then(response => response.json());
    byId('model').textContent = data.model;
    byId('key').textContent = data.configured ? 'API key ready' : 'Add your API key to .env and restart';
    byId('calls').textContent = data.calls;
    byId('limit').textContent = `Limit: ${data.maxCalls} decisions per service run`;
    byId('cost').textContent = `$${data.estimatedCost.toFixed(4)}`;
    if (data.sessions.length) {
      byId('games').replaceChildren(...data.sessions.map(game => {
        const div = document.createElement('div');
        div.className = 'game';
        div.textContent = `${game.result === '*' ? 'In progress' : game.result} · ${game.history.length} half-moves · ${game.history.join(' ')}`;
        return div;
      }));
    }
    byId('notice').textContent = '';
  } catch { byId('notice').textContent = 'Local service unavailable. Run npm start.'; }
}
refresh();
setInterval(refresh, 2000);
