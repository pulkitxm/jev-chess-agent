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

## The next useful experiments

1. Build a fixed, independent tactical test set covering forks, pins, hanging queens, mate defense, promotion, and endgames. Lichess publishes CC0 puzzle data with solution moves and themes. Use solutions only for offline grading, never to choose live moves. Its puzzle FEN is before the opponent's first move, so apply that first move before testing the solver.
2. Compare compact prompts with separate Jev judgments for tactical danger and positional improvement. Always let a final Jev choice see all legal moves. More questions must earn their extra latency through measured improvement.
3. Measure full-game results against a fixed opponent and record every attempt. Report wins, draws, and losses, rather than only the best recording.
4. If deeper search is added, describe it accurately as search-assisted Jev. A search engine that supplies the best move would materially change the original experiment.

Dataset: https://database.lichess.org/#puzzles

## A credible public demo

A useful hook is showing the same decision system before and after improving its input: old queen blunder, explicit tactical warning, improved decision, then a complete real match. Keep the opponent label, move log, and final result visible. Link the full recording and describe the tactical assistance. An Advanced win is not a Maximum win. No result or viral reach is guaranteed.
