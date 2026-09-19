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

For a complete live match with a 4K, 16:9 MP4 export:

```sh
npm run record:4k
```

This single command starts a dedicated visible Chrome session, opens Maximum, lets Jev choose every move, continuously records a readable 1920 by 1080 browser layout and scales it to a 3840 by 2160 export, and exports `match-4k.mp4` alongside the PGN and decision logs. The export trims initial loading, keeps the entire match and result screen, and uses H.264 at 30 frames per second. The 4K export is upscaled from continuous 1080p browser video. It preserves capture timing and repeats frames where needed; it does not create additional motion detail. No audio is recorded. The FFmpeg encoder is installed with the project dependencies.

The runner always opens a visible Chrome window with its own persistent profile. To choose the local output folder, use `npm run record:4k -- --output data/my-match`. Each match makes paid TypeSafe requests. A complete recording does not imply a win. Check `complete` in `summary.json`; an interrupted game saves its available footage. The source `demo.webm` is retained locally for recovery if export fails.

The full runner plays through the game result without a default move or time cutoff. Use Ctrl+C to stop early and finalize the video. Optional `--max-moves` and `--seconds` explicitly limit a run; such a recording is incomplete unless the game ends first.

```sh
npm run demo -- --max-moves 5 --seconds 90
npm run play -- --max-moves 50 --seconds 300
```

Each run saves `game.pgn`, `decisions.jsonl`, and `summary.json`, plus `demo.webm` for standard runs or `match-4k.mp4` and `recording.json` for 4K runs under `data/runs/<timestamp>/`. The terminal prints the exact folder. Setup time is separate from the play time limit. The video captures the browser viewport, not the desktop or microphone.

The runner uses its own profile at `data/runner-profile`. It can import chess.com cookies exported locally using the session commands below, or play as a guest when no session is configured and chess.com permits it. Site challenges or login requirements may prevent automatic startup. Only one runner can use the profile at a time.

Jev chooses the moves through TypeSafe. A normal program handles watching, validation, clicks, polling, recording, and stopping. Only Jev is called between turns, once normally and once more if a detected tactical loss triggers reconsideration.

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

The rules library produces all legal moves. The local report for each option includes its chess notation, captures, resulting position, check, checkmate, and draw status. It also lists the opponent's legal replies, identifies immediate checkmates, and spells out material exchanges after forcing replies. Material uses conventional pawn units: pawn 1, knight 3, bishop 3, rook 5, queen 9. Legal recaptures on the same square are examined up to six captures further, allowing either side to decline an exchange. These narrow tactical calculations are not a complete positional search. No Stockfish, opening book, candidate filtering, or best-move override is used.

The move selector gives Jev the current position, previous moves, and this menu of legal choices through TypeSafe's Choice question. The request contains compact tactical summaries and a bounded sample of forcing replies, with a 32,000-character request budget. Every legal candidate remains available; complete tactical reports stay in local decision logs. If Jev chooses a detected material loss or immediate mate while an alternative without those detected problems exists, it gets one explicit warning and a second choice with every legal move still available. Jev's final answer is honored even if it ignores the warning. Decision logs contain both rounds and aggregate token usage. The service rejects any answer outside the menu. The extension checks that the board is still in the same position before clicking, and confirms the resulting position afterward.

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
| `CHESS_SESSION_FILE` | `data/auth/chess-session.json` when present | Private chess.com cookie file |

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
- The extension has a 150-move limit per run, and the service has its separate decision limit. The standalone full-game runner has no default cutoff.
- Special moves are supported by the rules library. Live site behavior for castling, en passant, and the promotion picker still needs dedicated browser verification.
- Chess.com may change its markup or require manual site interaction. This is a local prototype, not an unattended hosted service.

## Verification

The automated suite covers legal move enumeration, castling, en passant, underpromotion, checkmate detection, invalid model answers, board coordinates, duplicate starts, quick opponent replies, pause during a request, navigation restrictions, local pairing, request limits, and PGN recording. Browser control tests use a simulated Chrome interface and a real chess rules library.

A complete initial game was played against Maximum using the Jev service and interactive browser controls. Maximum won by checkmate on move 21. This demonstrated working interaction, including castling, but weak chess decisions.

The dashboard was opened and visually checked in a browser. The extension has not been verified in an uninterrupted installed-extension game. Standalone runner tests separately cover autonomous turns, canvas move history, cancellation, stale decisions, and game-over handling.

The standalone runner completed a live five-decision demo against Maximum in about 30 seconds, including browser setup, and finalized a browser video without interactive orchestration between turns. This verifies automatic play and recording, not a win against Maximum.

Tactical checks cover the original bishop and rook sacrifices, equal exchanges, immediate mate threats, and preservation of the complete legal choice list during reconsideration. A live diagnostic changed the old losing rook check to a move without a detected material loss after reconsideration. These limited diagnostics do not establish a playing-strength rating.

The standalone runner also completed and recorded an uninterrupted full match with tactical summaries enabled. Maximum won by checkmate on move 42. The video includes the starting board, every move, and the result screen. A delayed final move-list update exposed a result logging race; the runner now waits for final notation, with a regression test. All 29 automated tests pass. This result does not demonstrate that Jev can beat Maximum.

## Verified win attempts

`npm run attempt:win -- --games 3` runs up to three complete matches, saves every result and recording, and stops early only for a verified win. It checks the PGN for checkmate and audits each white move against the recorded final Jev answer. Errors and incomplete games stop the run. Exit code 2 means the attempt limit was reached without a win. Use `--strategy original` for the original numeric descriptions; the default experimental `semantic` strategy uses plain-language warnings. Neither strategy filters legal moves or overrides Jev. More attempts do not guarantee a win.

The selector now always reconsiders an uncompensated queen loss or immediate mate threat, including positions where every alternative also has a material warning. This fixes a missed review condition, not the model's chess ability. Jev may still insist on a bad move. TypeSafe's current [model documentation](https://docs.typesafe.ai/models) does not offer customer fine-tuning, and both current model aliases resolve to the same version.

The experimental `foresight` strategy extends opponent checking moves through every legal response and the next opponent capture or immediate mate. This exposes some forks missed by the original exchange-only reports. The experimental `deliberate` strategy adds separate Jev questions about defense and piece coordination, then asks Jev for the final move with every legal option still available. Neither is established as strong enough to beat Maximum. Run either with `npm run attempt:win -- --games 2 --strategy foresight` or `--strategy deliberate`. Decision timings include local tactical analysis and model calls.

## Beginner engine

`npm run play:beginner` runs one complete match against the Beginner engine in visible Chrome, using the experimental development strategy, and exports the recording to 4K. The opponent name is recorded separately from Maximum in the PGN and summary. You can also select it with `npm run play -- --opponent beginner --4k`. A win against Beginner is not a win against Maximum. Site verification challenges can block startup; the runner saves an error screenshot and stops rather than claiming a played game.

The experimental `development` strategy includes the extended checking lines plus factual descriptions of repeated piece moves, initial minor-piece development, central pawn moves, and blocked central pawns. Jev still makes the final choice from all legal moves.

## Reuse a local Chrome login

On macOS, with permission to read the selected Chrome profile:

```sh
npm run session:setup
npm run session:export
npm run play:beginner
```

The exporter selects Chrome's last-used profile. To specify one, use `npm run session:export -- --profile "Default"` or a numbered profile such as `"Profile 1"`. It reads only chess.com cookie rows, decrypts them using Chrome's existing macOS Keychain entry, and writes `data/auth/chess-session.json` with permissions 600 inside a directory with permissions 700. Temporary databases contain only chess.com rows and are deleted after export. Cookie values and the Keychain password are never printed. macOS may require access approval for the calling application or its Keychain request; the script does not bypass those controls.

The cookie file and the Python environment under `data/session-tools` are ignored by Git. The runner automatically imports the default cookie file before navigating. To use a different private file, set `CHESS_SESSION_FILE` to its path in the ignored `.env`; do not paste cookie values into tracked configuration. The runner rejects cookies outside chess.com and files readable by other users. An imported session does not guarantee that Chrome will pass site verification. LocalStorage and other sites' sessions are not exported.

Run `npm run play:advanced` for one match against Advanced (1600), engine level 12, in visible Chrome with a 4K video export. Jev chooses every move using the development strategy.
