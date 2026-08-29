# React Chess

A chess application built with React and Vite: play a friend on the same
device, or play the built-in engine at one of three strengths.

```bash
cd chess
npm install
npm run dev     # http://localhost:5173
npm test        # rule and engine tests
npm run build   # production bundle in dist/
```

## Features

- Full move rules — castling, en passant, pawn promotion (with a piece
  picker), pinned pieces, and forced check evasion.
- Check, checkmate and stalemate detection.
- Human vs. human, or human vs. computer as either colour.
- Move list in standard algebraic notation, with disambiguation and
  check/mate suffixes.
- Legal-move dots, last-move and check highlighting, captured pieces and the
  material edge, board flip, undo, and the position as FEN.
- Adapts to the system light/dark colour scheme.

Draw by the fifty-move rule, threefold repetition and insufficient material
are **not** enforced — those games simply continue.

## Layout

| Path | What it holds |
| --- | --- |
| `src/engine/board.js` | Board representation, FEN parsing and serialising |
| `src/engine/moves.js` | Move generation, attack detection, move application |
| `src/engine/game.js` | Game status and algebraic notation |
| `src/engine/ai.js` | Negamax search with alpha-beta and quiescence |
| `src/components/` | Board, pieces, move list, promotion dialog, setup screen |
| `test/` | Vitest suites, including perft node counts |

The engine is plain JavaScript with no React dependency, so it can be used or
tested on its own.

### Board representation

A flat 64-entry array, index 0 = a8 through index 63 = h1, holding FEN
characters (uppercase white, lowercase black) or `null`. A position is a plain
object — `{ board, turn, castling, ep, halfmove, fullmove }` — and `makeMove`
returns a new one rather than mutating, which is what makes undo a matter of
dropping the last entry of the history.

### The computer opponent

Negamax with alpha-beta pruning, MVV-LVA move ordering and a capture-only
quiescence search, evaluating material plus piece-square tables. Easy and
medium add a little randomness so they do not repeat the same game.

| Level | Search depth |
| --- | --- |
| Easy | 1 ply |
| Medium | 2 ply |
| Hard | 3 ply |

## Tests

`npm test` runs 53 tests. Beyond the per-rule cases, `test/perft.test.js`
walks the four standard perft positions and compares the leaf-node counts
against the published values (197,281 nodes at depth 4 from the starting
position) — these only match if castling rights, en passant, promotion and
check evasion are all handled correctly.
