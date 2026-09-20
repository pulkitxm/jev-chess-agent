# Improving Jev at chess

## What changed

The compact strategy gives Jev a shorter description of each legal move. It states the detected outcome first: checkmate, a material loss, a material gain, or no detected loss. It includes the most relevant refutation and opening-development facts without repeating the full explanation for every move.

The rules library calculates legal moves and limited tactical consequences. Jev selects the final move from every legal option, including bad ones. A warning can trigger one reconsideration, but the program never substitutes another move. This is a Jev decision system with tactical assistance, not an unaided model or a trained chess engine.

Run a full visible-browser match with recording:

```sh
npm run play:advanced -- --strategy compact
```

Run the historical error comparison:

```sh
node --env-file-if-exists=.env scripts/evaluate-strategies.js --limit 12
```

The comparison selects unique positions from saved games where the old decision lost material and the current tactical checker detects an alternative without that loss. It sorts positions by a stable hash and evaluates both strategies on the same inputs. Full results remain in the ignored data/evaluations folder.

## Initial measured result

On September 20, 2026, five eligible historical positions were available. The development strategy avoided the detected loss in three. The compact strategy avoided it in all five. Average total decision time was 1,198 milliseconds for development and 882 milliseconds for compact.

This is a small, selected regression set. It measures compliance with limited tactical facts, not objectively best moves, an Elo rating, or a match win rate. These positions are development data. They must not be presented as an independent benchmark.

## Focused defensive review

The compact-review strategy adds an independent defensive choice and then asks Jev for the final move with every legal option still available. On a second run with six eligible positions, including one from the ongoing Advanced match, compact avoided five detected losses and compact-review avoided all six. Average times were 1,475 and 1,799 milliseconds respectively. Timing runs had concurrent local work, so these are observations rather than a controlled latency benchmark. The new sixth position is development data too, not a held-out test.

Use `npm run play:advanced -- --strategy compact-review` to try this version.

## Full-game results

Two fresh Advanced (1600), engine level 12 games were played in visible Chrome on September 20, 2026:

| Strategy | Result | Jev moves |
| --- | --- | --- |
| compact | Loss by checkmate | 44 |
| compact-review | Loss by checkmate | 65 |

Both PGNs were checked for checkmate. Every recorded white move matched the final Jev API choice. Both runs recorded the complete match for a 3840 by 2160 export, upscaled from 1920 by 1080 capture. The second game reached a pawn endgame. More moves before defeat are not proof of higher playing strength. These trials produced no Advanced win and no Maximum win.

The existing default strategy is unchanged. These remain experimental alternatives, with results too limited to claim reliable superiority.

## What the service supports

The current Jev model accepts text only. It does not accept board screenshots, audio, or video. TypeSafe does not offer customer fine-tuning or LoRA. Supplying training examples in a request changes the context, not the model weights.

TypeSafe documents weaknesses in numerical precision, indirect reasoning, and large contexts. That makes shorter, explicit descriptions a reasonable experiment. It does not imply that prompting can turn Jev into a top chess engine.

Sources:

- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/model-jaggedness/jev-1.13
- https://docs.typesafe.ai/patterns/composite-scoring

## Tactical comparison and quiet-threat follow-up

Six further Advanced matches on September 20 tested successive rules-only changes:

| Implementation | Result | Jev moves |
| --- | --- | --- |
| Original compact-review, unchanged rerun | Loss by checkmate | 30 |
| Explicit comparison of tactical outcomes | Loss by checkmate | 27 |
| Quiet-threat lookahead | Loss by checkmate | 85 |
| Position and endgame facts, trial 1 | Loss by checkmate | 43 |
| Position and endgame facts, trial 2 | Loss by checkmate | 47 |
| Explicit opening-development advice | Loss by checkmate | 48 |

Every result passed the position, history, and final-choice audit. The first three runs are under `data/runs/2026-09-19T22-48-58-277Z`, `data/runs/2026-09-19T22-51-13-858Z`, and `data/runs/2026-09-19T22-55-37-795Z`. The last three are under `data/attempts/2026-09-19T23-02-26-013Z`. Each has a complete PGN, decision log, and 4K video export. All six were losses, and longer games do not establish improved strength.

In the first game, `14.Rad1` lost the queen for a knight even though moving the queen limited the detected loss to one pawn. Explicitly labeling the preferred tactical group changed a replayed Jev choice to `Qe4`, reducing the detected loss from six units to one. Every legal move stayed available. The revised prompt also avoided the detected loss on all six eligible historical regression positions, averaging 1,629 milliseconds per decision. Those positions are development data and do not measure independent playing strength.

In the second game, `18.Bf4` looked harmless to the exchange checker, but the quiet reply `...d4` forced a piece loss. Compact-review now extends quiet pawn attacks, attacks on more valuable pieces, and knight forks through every legal response and the next opponent capture or mate. The same position then received a two-unit loss warning, and a replayed Jev decision selected `b3`, which had no loss detected by those checks. That replay took approximately 11.6 seconds. The calculations are bounded tactical assistance, with no external chess engine, opening book, candidate filtering, or substituted move.

The evaluator now includes positions where every move loses material, grading the best detected outcome and improvement over the original choice. A completed eight-position run at `data/evaluations/2026-09-19T23-09-25-736Z` improved all eight original decisions and matched the best detected outcome in all eight. Two positions had a detected no-loss option; six required limiting a loss or escaping mate. Average decision time was 5,960 milliseconds with concurrent local work. This selected development set is not an independent strength benchmark.

Position descriptions now identify material balance, passed pawns, blockades, king approach, castling rights, and repeated pawn moves. Basic opening advice highlights unused minor pieces, central pawn development, and castling only among moves with an equally good detected tactical outcome. A replay of an unnecessary `Ng5` changed to `d3`, opening the bishop's path. A later unit-tested correction accounts for immediate recaptures of promoted pieces. These changes corrected specific failures but did not produce an engine-free Advanced win in the six measured games.

## Separate engine-assisted strategy

`engine-review` supplies Stockfish evaluations and principal variations for every legal move. Jev makes the final choice, with one review if it declines the engine's first recommendation. This is a different experiment from the rules-only runs. The PGN player label, summary, audit, and per-move engine records identify the assistance. Stockfish 19 was installed locally for validation. A live Jev API diagnostic selected the engine-advised `Qxf7#` in a mate-in-one position; that diagnostic alone is not a full-game win.

Run it with `npm run play:advanced:assisted`. The original compact-review command remains available for engine-free comparisons.

The assisted strategy uses Stockfish's established alpha-beta search and NNUE evaluation through its standard process interface. The model receives the resulting analysis and selects the final move. Finite searches do not guarantee perfect play. See the [Stockfish algorithm and evaluation documentation](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html). TypeSafe's [current model documentation](https://docs.typesafe.ai/models) confirms that customer fine-tuning and LoRA are unavailable; these implementation changes improve the information and decision process around Jev, not its hosted weights.

The match audit also checks every legal move's engine record, the shared search iteration, and each displayed continuation's legal moves and notation. Its `engineAudit` output reports engine versions, search-depth bounds, reviewed decisions, and how many final choices followed the first recommendation. It rejects missing or duplicated candidates and inconsistent continuations. This checks the recorded evidence, not the objective optimality of an engine evaluation.

## Verified assisted wins

On September 20, 2026, the first complete engine-review match beat Advanced (1600), engine level 12 (`Komodo12`), by checkmate with `32.Qg7#`. The result was `1-0`, using Jev `jev-1.13.0` with Stockfish 19 advice. All 32 played white moves matched Jev's final API choice, and all 32 choices matched Stockfish's first recommendation. This demonstrates a working assisted system, not independent chess strength from Jev.

Every decision included evaluations for the complete legal move list. The latest complete search depths ranged from 10 to 18. The match took approximately 281 seconds, including startup. The PGN, decision history, terminal result, and assistance label passed the match audit. All 60 automated tests and the extension build passed.

The full local recording export completed successfully. Artifacts are under `data/runs/2026-09-19T23-20-25-772Z`: `game.pgn`, `decisions.jsonl`, `summary.json`, `verification.json`, and `match-4k.mp4`. The 3840 by 2160 video is upscaled from continuous 1920 by 1080 browser capture.

A second complete assisted game on the same day also beat Advanced, this time with `29.Rxe8#` after `28.Qe8+ Rxe8`. It used a different opening, beginning `1.e4 Nf6`, and included `17.Rf7 Qxf7 18.Nxf7 Kxf7`, trading a rook and knight for the opponent's queen. The opponent was again `Komodo12`, and the game used the same Jev and Stockfish versions. All 29 final decisions followed the first engine recommendation. Complete search depths ranged from 11 to 17, and the match took approximately 260 seconds, including startup. The full recording and logs are under `data/runs/2026-09-19T23-40-02-036Z`.

Both wins passed the stronger audit, which replayed all 61 final choices and the displayed engine continuations while checking complete legal-move coverage. All 66 automated tests and the extension build pass. The local combined audit is `data/diagnostics/assisted-validation.json`.

The two original five-second assisted trials produced two wins. A later one-second trial also won, as detailed below. The seven latest rules-only trials produced zero wins and seven losses. These different methods must be reported separately. These few Advanced games do not establish a reliable win rate; Maximum was tested separately below.

## Proving a winning sacrifice without Stockfish

A live compact-review diagnostic rejected `Qb8+` in a position where the only legal defense is `Nxb8`, followed by `Rd8#`. It chose `Qxe6+` instead. The exchange calculation assigned the winning queen sacrifice a nine-unit material loss and did not represent the forced mating continuation.

The extended tactical calculation now checks forcing mates in two. After a checking candidate, it enumerates every legal opponent reply and requires a legal immediate checkmate after each one. A single defense without mate disproves the claim. Terminal draws stop the search, and the calculation restores the original position and history. This is a bounded exhaustive proof, not a general evaluation, opening book, learned model, or external engine recommendation.

Compact prompts prioritize these proven wins over material preservation and include a mating continuation for every defense. Every legal option remains available, and Jev still makes the final choice. The same live diagnostic then selected `Qb8+` without Stockfish advice, taking approximately 4.6 seconds. The before and after decisions are saved locally as `data/diagnostics/queen-sacrifice-before.json` and `data/diagnostics/queen-sacrifice-after.json`.

All 64 tests and the extension build pass, including checks that distinguish a forced win from a cooperative mating line. This corrects a specific sacrifice failure. It does not establish perfect sacrifices, general mate search, improved model weights, or an engine-free Advanced win.

A subsequent full compact-review match against Advanced lost by checkmate after 36 Jev decisions. Every white move passed the final-choice, position, and history audit, with no external engine advice. The game and decision logs are under `data/runs/2026-09-19T23-31-15-620Z`. This brings the latest rules-only sequence to seven losses and zero wins. The sacrifice regression improved, but a full-game strength improvement remains unproven.

The final sacrifice from the second assisted win was then replayed using compact-review with no engine advice. Jev independently selected `Qe8+`, and the bounded proof verified `Rxe8 Rxe8#` against every legal defense. This different position had not been used to tune the mate proof or prompts. The diagnostic took approximately 2.1 seconds and is recorded at `data/diagnostics/advanced-win-queen-sacrifice.json`. It verifies the sacrifice handling on another position, not an engine-free full-game win.

## Decision latency

The original two assisted wins averaged approximately 6.6 seconds per decision. Around 5.1 seconds was engine analysis. The assisted path also performed rules-only tactical calculations that its model request never used.

Assisted decisions now skip those unused calculations, with a test confirming that the model request remains identical for the same engine analysis. Displayed variations are converted from the current board position instead of replaying the entire game for each candidate; the engine itself still receives the complete move history. Logs now separate preparation, engine analysis, model requests, and remaining processing time.

The default search budget is now 1,000 milliseconds instead of 5,000. Eleven unique positions sampled evenly from the two recorded wins averaged 1,652 milliseconds, compared with their historical average of 6,787 milliseconds. All eleven selected the same move as before, followed the engine's first recommendation, and missed no mating score present in the saved reference. Average measured components were 12 milliseconds of preparation, 1,180 milliseconds of engine work, and 461 milliseconds of model-request time. The local results are in `data/latency/2026-09-20T05-06-38-293Z`.

These observations are not a controlled latency study or an independent strength benchmark. The shorter search can change evaluations and playing strength. Set `STOCKFISH_MOVETIME_MS=5000` in the local environment to restore the original search budget. Existing explicit environment settings take precedence over the new default.

A fresh full match with the new default beat Advanced with `25.Qxf7#`. Its 25 decisions averaged 1,581 milliseconds, with a median of 1,531 milliseconds and a maximum of 2,632 milliseconds on the first request. Average components were 8 milliseconds of preparation, 1,172 milliseconds of engine work, and 401 milliseconds of model-request time. The complete run took approximately 100 seconds, including startup and browser interaction. Every decision used the 1,000-millisecond search budget; complete search depths ranged from 9 to 13.

All 25 choices followed the first engine recommendation and passed the full legal-move, continuation, position, history, and final-choice audit. The game, timing summary, and recording are under `data/runs/2026-09-20T05-08-06-951Z`, with timing details in `latency.json`. All 67 tests and the extension build pass. This is a verified fast assisted win, not evidence that every shorter search is equally strong.

Replay another comparison with paid model calls:

```sh
node --env-file-if-exists=.env scripts/benchmark-latency.js --match data/runs/2026-09-19T23-20-25-772Z --match data/runs/2026-09-19T23-40-02-036Z --movetime 1000
```

## Verified Maximum win

On September 20, 2026, the fast assisted strategy beat Maximum (`Komodo25`) with `127.Qh5#`, for a result of `1-0`. The runner used `https://www.chess.com/play/computer/Komodo25`, Jev `jev-1.13.0`, and Stockfish 19 with the unchanged 1,000-millisecond search budget. The long endgame included `122.c8=Q` before the final mating sequence.

All 127 played white moves matched Jev's final answer and Stockfish's first recommendation. The audit replayed the 253 plies, checked complete legal-move coverage, and validated every displayed engine continuation. Complete search depths ranged from 9 to 18, and no second-choice review was needed.

Decisions averaged 1,592 milliseconds, with a median of 1,538 milliseconds and a maximum of 3,046 milliseconds. Average preparation, engine, and model-request times were 13, 1,128, and 451 milliseconds respectively. The run took approximately 466 seconds, including startup and browser interaction. Local artifacts are under `data/runs/2026-09-20T05-14-41-675Z`, including `game.pgn`, `decisions.jsonl`, `summary.json`, and `latency.json`.

This is one verified Maximum win by the Stockfish-assisted system. It does not establish an engine-free Jev win, perfect play, or a reliable win rate against Maximum. No playing-code changes were needed after the preceding 67-test and build pass.

## Further experiments

1. Build a fixed, independent tactical test set covering forks, pins, hanging queens, mate defense, promotion, and endgames. Lichess publishes CC0 puzzle data with solution moves and themes. Use solutions only for offline grading, never to choose live moves. Its puzzle FEN is before the opponent's first move, so apply that first move before testing the solver.
2. Compare compact prompts with separate Jev judgments for tactical danger and positional improvement. Always let a final Jev choice see all legal moves. More questions must earn their extra latency through measured improvement.
3. Measure full-game results against a fixed opponent and record every attempt. Report wins, draws, and losses, rather than only the best recording.
4. Evaluate deeper engine search separately from rules-only improvements. The engine-review strategy is search-assisted Jev and materially changes the original experiment.

Dataset: https://database.lichess.org/#puzzles

## A credible public demo

A useful hook is showing the same decision system before and after improving its input: old queen blunder, explicit tactical warning, improved decision, then a complete real match. Keep the opponent label, move log, and final result visible. Link the full recording and describe the tactical assistance. An Advanced win is not a Maximum win. No result or viral reach is guaranteed.
