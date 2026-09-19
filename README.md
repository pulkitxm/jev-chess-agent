# Jev Chess Agent

A local chess.com bot-game player. Jev selects every move from the complete legal move list. The extension reads the visible board, asks the local service for Jev's decision, clicks that move, and waits for the opponent.

**Playing strength is experimental. A win against Maximum (3200) has not been established.** Reliable clicking and legal moves do not imply strong chess play.

## Run automatically

Requires Node.js 22 or newer and desktop Google Chrome.

```sh
npm ci
npx playwright install ffmpeg
```

If `.env` does not exist, copy `.env.example` to `.env` and add your TypeSafe key. Keep an existing configured `.env`.

```sh
npm run demo
```

This launches a dedicated Chrome profile, opens Maximum, starts a bot game, plays up to eight Jev moves, and saves a real browser recording. No chat interaction is needed between turns. The default demo stops after eight decisions or two minutes of play.

For a full game:

```sh
npm run play
```

The full runner stops at game end, 150 Jev moves, or 15 minutes of play. Use Ctrl+C to stop early and finalize the video.

```sh
npm run demo -- --max-moves 5 --seconds 90
npm run play -- --headless --max-moves 50 --seconds 300
```

Each run saves `demo.webm`, `game.pgn`, `decisions.jsonl`, and `summary.json` under `data/runs/<timestamp>/`. The terminal prints the exact folder. Setup time is separate from the play time limit. The video captures the browser viewport, not the desktop or microphone.

The runner uses its own profile at `data/runner-profile`. It does not access your usual Chrome profile or copy your login cookies. It can play as a guest when chess.com permits this. Site challenges or login requirements may prevent automatic startup. Only one runner can use the profile at a time.

Jev chooses the moves through TypeSafe. A normal program handles watching, validation, clicks, polling, recording, and stopping. The only model call between turns is the Jev request itself.

## Optional dashboard and extension

```sh
npm run build
npm start
```

Open [the dashboard](http://127.0.0.1:4318) for the local pairing code. In `chrome://extensions`, enable Developer mode, load `dist/extension`, and pair through its popup. Start a fresh bot game, choose your color, then use **Play automatically** or **Play one move**. Use **Pause** to stop.

The extension uses Chrome's debugger permission for clicks and supports DOM-rendered piece boards. The standalone runner also supports canvas themes by reading the visible move list and is the preferred way to record demos. Human games are rejected.

## How it works, in ordinary language

The system has three jobs:

| Part | Job |
| --- | --- |
| Chrome extension | Reads where the pieces appear and clicks squares |
| chess.js | Checks the rules and remembers the full game |
| Jev through TypeSafe | Chooses which legal move to play |

The standalone runner reconstructs the position from the visible move list, including piece icons. This works with both canvas and DOM board themes. It does not send screenshots or use a vision model. The extension reads rendered piece elements instead.

The rules library produces all legal moves. Each option includes its normal chess notation, the pieces remaining after the move, any capture, and whether it gives check, checkmate, or a draw. These are rule-based facts. No Stockfish, engine score, opening book, move ranking, or best-move override is used.

The local service gives Jev the current position, the previous moves, and this menu of legal choices. Jev selects one choice through TypeSafe's Choice question. The service rejects any answer outside the menu. The extension checks that the board is still in the same position before clicking, and confirms the resulting position afterward.

Jev's confidence is its reported confidence in that choice. It is not a measured probability of winning and is not an engine evaluation.

## Commands

```sh
npm test
npm run build
npm start
npm run choose -- e4 e5 Nf3 Nc6
```

The last command asks Jev to select the next move after the supplied SAN move history. It makes a paid TypeSafe request and does not click a browser.

## Local settings and records

| Setting | Default | Meaning |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | Required | TypeSafe credential, kept in `.env` |
| `TYPESAFE_MODEL` | `jev-1.13.0` | Pinned model version |
| `MAX_CALLS` | `200` | Maximum decision attempts per service run |
| `PORT` | `4318` | Local service port; extension expects 4318 |
| `DATA_DIR` | `data/` | Local records directory |

The dashboard's estimate uses $0.042 per million input tokens. It is not a billing statement and does not include CLI calls or previous service runs. Verify current pricing with [TypeSafe](https://docs.typesafe.ai/).

The service binds to `127.0.0.1`. The pairing code lets the extension call it without holding the TypeSafe key. The key is sent to TypeSafe only as the request credential; the chess position and candidates are sent for move selection.

Ignored local files:

- `.env`: API configuration.
- `data/bridge-token`: the local pairing credential.
- `data/decisions.jsonl`: model decisions, token usage, and timings.
- `data/<game-id>.pgn`: recorded games that can be opened in a chess viewer.
- `dist/extension`: generated extension bundle.

Dashboard game cards and counters are held in memory and reset when the service restarts. PGNs and decision logs remain on disk. Reload the extension in `chrome://extensions` after rebuilding it.

## Current limitations

- No verified win against Maximum. Jev may make strategically weak moves despite choosing only legal ones.
- Start from a fresh standard position. Resuming is supported only when the same browser session has saved the game's history and the observed board is at most one legal move ahead.
- Page changes, animations that never settle, navigation, covered squares, and unconfirmed clicks stop play instead of guessing.
- The extension has a 150-move limit per run, and the service has its separate request limit.
- Special moves are supported by the rules library. Live site behavior for castling, en passant, and the promotion picker still needs dedicated browser verification.
- Chess.com may change its markup or require manual site interaction. This is a local prototype, not an unattended hosted service.

## Verification

The automated suite covers legal move enumeration, castling, en passant, underpromotion, checkmate detection, invalid model answers, board coordinates, duplicate starts, quick opponent replies, pause during a request, navigation restrictions, local pairing, request limits, and PGN recording. Browser control tests use a simulated Chrome interface and a real chess rules library.

A complete initial game was played against Maximum using the Jev service and interactive browser controls. Maximum won by checkmate on move 21. This demonstrated working interaction, including castling, but weak chess decisions.

The dashboard was opened and visually checked in a browser. The extension has not been verified in an uninterrupted installed-extension game. Standalone runner tests separately cover autonomous turns, canvas move history, cancellation, stale decisions, and game-over handling.

The standalone runner completed a live five-decision demo against Maximum in about 30 seconds, including browser setup, and finalized a browser video without interactive orchestration between turns. This verifies automatic play and recording, not a win against Maximum.
