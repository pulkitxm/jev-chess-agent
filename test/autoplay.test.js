import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { autoplay, validateProgress } from '../src/autoplay.js';
import { fromHistory, candidates } from '../src/chess.js';
import { readVisibleGame, startEngine } from '../src/browser-game.js';

const decision = history => {
  const chess = fromHistory(history);
  return { fen: chess.fen(), move: candidates(chess).find(move => move.uci === 'e2e4'), elapsedMs: 100, confidence: 0.5 };
};

test('standalone loop chooses, clicks, observes a fast reply, saves and stops itself', async () => {
  let history = [], saved = [], played = 0;
  const result = await autoplay({
    observe: async () => ({ history: [...history], active: true, latest: true }),
    choose: async current => decision(current),
    play: async move => { assert.equal(move.uci, 'e2e4'); played++; history = ['e4', 'e5']; },
    save: async chess => { saved = chess.history(); },
    log: () => {}, maxMoves: 1
  });
  assert.equal(played, 1);
  assert.deepEqual(saved, ['e4', 'e5']);
  assert.equal(result.reason, 'Move limit reached');
});

test('standalone loop never clicks a stale model response', async () => {
  let history = [], played = false;
  await assert.rejects(autoplay({
    observe: async () => ({ history: [...history], active: true, latest: true }),
    choose: async current => { const answer = decision(current); history = ['d4']; return answer; },
    play: async () => { played = true; }, save: async () => {}, log: () => {}, maxMoves: 1
  }), /Board changed while Jev/);
  assert.equal(played, false);
});

test('stopping the runner while a decision is pending prevents its click', async () => {
  const controller = new AbortController();
  let played = false;
  await assert.rejects(autoplay({
    observe: async () => ({ history: [], active: true, latest: true }),
    choose: async history => { controller.abort(new Error('Stopped')); return decision(history); },
    play: async () => { played = true; }, save: async () => {}, signal: controller.signal
  }), /Stopped/);
  assert.equal(played, false);
});

test('rejects move-list rewinds and recognizes a finished game', async () => {
  assert.throws(() => validateProgress(['e4'], ['d4']), /history changed/);
  const result = await autoplay({
    observe: async () => ({ history: ['f3', 'e5', 'g4', 'Qh4#'], active: false, latest: true }),
    choose: async () => { throw new Error('Must not call Jev after mate'); },
    play: async () => {}, save: async () => {}
  });
  assert.equal(result.result, '0-1');
  assert.equal(result.decisions, 0);
});

test('canvas boards use rendered SAN including figurine icons and detect review mode', () => {
  const dom = new JSDOM('<div id="board-play-computer"><canvas></canvas></div><button aria-label="Resign"></button><wc-simple-move-list><div class="main-line-ply"><span class="node-highlight-content">e4</span></div><div class="main-line-ply"><span class="node-highlight-content">e5</span></div><div class="main-line-ply"><span class="node-highlight-content selected"><span data-figurine="N"></span> f3</span></div></wc-simple-move-list>');
  globalThis.document = dom.window.document;
  document.querySelector('#board-play-computer').getBoundingClientRect = () => ({ x: 0, y: 0, width: 640, height: 640 });
  try {
    assert.deepEqual(readVisibleGame().history, ['e4', 'e5', 'Nf3']);
    assert.equal(readVisibleGame().latest, true);
    document.querySelector('.selected').classList.remove('selected');
    document.querySelector('.node-highlight-content').classList.add('selected');
    assert.equal(readVisibleGame().latest, false);
  } finally { delete globalThis.document; }
});

test('startup creates a fresh game when the site remembers an unfinished one', async () => {
  let state = 'New Game';
  const clicked = [];
  const page = {
    goto: async () => {},
    getByText: () => ({ isVisible: async () => false }),
    url: () => 'https://www.chess.com/play/computer/Komodo25',
    getByRole: (role, { name }) => ({
      isVisible: async () => name === state,
      click: async () => { clicked.push(name); state = name === 'New Game' ? 'Play' : 'Resign'; }
    })
  };
  await startEngine(page);
  assert.deepEqual(clicked, ['New Game', 'Play']);
});

test('waits for the final move when game controls disappear before notation updates', async () => {
  let reads = 0, saved;
  const result = await autoplay({
    observe: async () => ({ history: ++reads === 1 ? ['f3', 'e5', 'g4'] : ['f3', 'e5', 'g4', 'Qh4#'], active: false, latest: true }),
    choose: async () => { throw new Error('Must not choose after game end'); },
    play: async () => {}, save: async chess => { saved = chess.history(); }
  });
  assert.equal(result.reason, 'Game finished');
  assert.equal(result.result, '0-1');
  assert.equal(saved.at(-1), 'Qh4#');
});

test('Beginner startup selects the level-one engine route', async () => {
  let target;
  let state = 'Play';
  const page = {
    goto: async url => { target = url; },
    getByText: () => ({ isVisible: async () => false }),
    url: () => target,
    getByRole: (role, { name }) => ({
      isVisible: async () => name === state,
      click: async () => { state = 'Resign'; }
    })
  };
  await startEngine(page, undefined, 'beginner');
  assert.equal(target, 'https://www.chess.com/play/computer/Komodo1');
  await assert.rejects(startEngine(page, undefined, 'unknown'), /Unknown engine/);
});


test('stops on human verification before attempting game controls', async () => {
  const page = {
    goto: async () => {},
    url: () => 'https://www.chess.com/play/computer/Komodo1',
    getByText: () => ({ isVisible: async () => true }),
    getByRole: () => { throw new Error('Must not interact with verification'); }
  };
  await assert.rejects(startEngine(page, undefined, 'beginner'), /requires human verification/);
});
