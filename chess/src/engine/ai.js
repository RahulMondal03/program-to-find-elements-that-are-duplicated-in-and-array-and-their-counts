// A small negamax engine: alpha-beta, MVV-LVA move ordering and a
// capture-only quiescence search to avoid obvious one-move blunders.

import { WHITE, colorOf, fileOf, rankOf, sq, typeOf } from './board.js'
import { generateLegalMoves, isInCheck, makeMove } from './moves.js'

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 }

// Piece-square tables, written from white's point of view, rank 8 first.
const TABLES = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0, 20, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
  ],
}

const MATE = 100000

/** Static evaluation in centipawns, from the point of view of `state.turn`. */
export function evaluate(state) {
  let score = 0
  for (let i = 0; i < 64; i++) {
    const piece = state.board[i]
    if (!piece) continue
    const type = typeOf(piece)
    const white = colorOf(piece) === WHITE
    // Black reads the table mirrored across the horizontal axis.
    const tableIndex = white ? i : sq(fileOf(i), 7 - rankOf(i))
    const value = PIECE_VALUE[type] + TABLES[type][tableIndex]
    score += white ? value : -value
  }
  return state.turn === WHITE ? score : -score
}

function scoreMove(move) {
  if (move.captured) {
    // Most valuable victim, least valuable attacker.
    return 10 * PIECE_VALUE[typeOf(move.captured)] - PIECE_VALUE[typeOf(move.piece)]
  }
  if (move.promotion) return PIECE_VALUE[move.promotion]
  return 0
}

const ordered = (moves) =>
  moves
    .map((move) => ({ move, score: scoreMove(move) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.move)

function quiescence(state, alpha, beta) {
  const standPat = evaluate(state)
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  const captures = ordered(
    generateLegalMoves(state).filter((move) => move.captured || move.promotion),
  )
  for (const move of captures) {
    const score = -quiescence(makeMove(state, move), -beta, -alpha)
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

function negamax(state, depth, alpha, beta, ply) {
  const moves = generateLegalMoves(state)
  if (moves.length === 0) {
    // Prefer mates that arrive sooner.
    return isInCheck(state) ? -MATE + ply : 0
  }
  if (depth === 0) return quiescence(state, alpha, beta)

  let best = -Infinity
  for (const move of ordered(moves)) {
    const score = -negamax(makeMove(state, move), depth - 1, -beta, -alpha, ply + 1)
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

export const DIFFICULTIES = {
  easy: { depth: 1, noise: 60 },
  medium: { depth: 2, noise: 15 },
  hard: { depth: 3, noise: 0 },
}

/**
 * Pick a move for the side to move. `noise` randomises the easier levels so
 * they neither play perfectly nor repeat the same game every time.
 */
export function chooseMove(state, difficulty = 'medium', random = Math.random) {
  const { depth, noise } = DIFFICULTIES[difficulty] ?? DIFFICULTIES.medium
  const moves = generateLegalMoves(state)
  if (moves.length === 0) return null

  const scored = ordered(moves).map((move) => ({
    move,
    score:
      -negamax(makeMove(state, move), depth - 1, -Infinity, Infinity, 1) +
      (noise ? (random() - 0.5) * noise : 0),
  }))

  return scored.reduce((best, entry) => (entry.score > best.score ? entry : best))
    .move
}
