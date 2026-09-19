# Jev Chess Agent

A local chess.com bot-game player. Jev selects every move from the complete legal move list. The extension reads the visible board, asks the local service for Jev's decision, clicks that move, and waits for the opponent.

**Playing strength is experimental. A win against Maximum (3200) has not been established.** Reliable clicking and legal moves do not imply strong chess play.

## Run

Requires Node.js 22 or newer and desktop Google Chrome.

```sh
npm ci
npm run build
cp .env.example .env
```

Put your TypeSafe key in `.env`, then start the local service:

```sh
npm start
```

If `.env` already exists, keep it instead of running the copy command. Never put your key in the extension, a commit, or a screenshot.

Open [the dashboard](http://127.0.0.1:4318). It shows whether a key is configured and provides the local pairing code.

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode, click **Load unpacked**, and select `dist/extension` in this project.
3. Open [Maximum](https://www.chess.com/play/computer/Komodo25). Reload the page if it was already open when the extension was loaded.
4. Start a fresh standard bot game. Select a color and use a mode without a timer for initial testing.
5. Open the **Jev Chess Agent** extension popup. Paste the dashboard pairing code and select the color you actually play.
6. Choose **Play one move** to check the setup, then **Play automatically** to continue.
7. Use **Pause** in the popup to stop. A decision already sent to TypeSafe can still incur a charge, but its late response will not start another move.

Chrome displays a debugger banner while the extension controls the board. Cancelling that banner or opening DevTools on the controlled tab may detach the controller and pause play. Keep the board visible and avoid making moves manually while the agent runs.

The debugger permission allows browser control. The implementation checks the tab's URL before every board operation and only accepts chess.com computer-game routes. Human games are unsupported and rejected.

## How it works, in ordinary language

The system has three jobs:

| Part | Job |
| --- | --- |
| Chrome extension | Reads where the pieces appear and clicks squares |
| chess.js | Checks the rules and remembers the full game |
| Jev through TypeSafe | Chooses which legal move to play |

The extension reads piece elements from the rendered page. It does not send screenshots or rely on a vision model. This is cheaper and less ambiguous than guessing squares from pixels.

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
- Chrome may pause background work, and chess.com may change its markup. This is a local prototype, not an unattended hosted service.

## Verification

The automated suite covers legal move enumeration, castling, en passant, underpromotion, checkmate detection, invalid model answers, board coordinates, duplicate starts, quick opponent replies, pause during a request, navigation restrictions, local pairing, request limits, and PGN recording. Browser control tests use a simulated Chrome interface and a real chess rules library.

Live checks confirmed that the TypeSafe key works and Jev selected `e4` and `Nf3`. Those moves were played through browser controls against Maximum, which replied `e5` and `Nc6`. This verifies the API and real board interaction, not an autonomous extension game or playing strength.

The dashboard was opened and visually checked in a browser. Full extension installation and an uninterrupted game remain separate verification steps.
