// Game-level helpers: status detection and algebraic notation.
//
// Draw-by-repetition, the fifty-move rule and insufficient material are
// deliberately not enforced; stalemate and checkmate are.

import { algebraic, fileOf, rankOf, typeOf } from './board.js'
import {
  generateLegalMoves,
  isInCheck,
  makeMove,
} from './moves.js'

export const STATUS = {
  PLAYING: 'playing',
  CHECK: 'check',
  CHECKMATE: 'checkmate',
  STALEMATE: 'stalemate',
}

/** Status of the position for the side to move. */
export function getStatus(state, legalMoves = generateLegalMoves(state)) {
  const check = isInCheck(state)
  if (legalMoves.length === 0) {
    return check ? STATUS.CHECKMATE : STATUS.STALEMATE
  }
  return check ? STATUS.CHECK : STATUS.PLAYING
}

export const isGameOver = (status) =>
  status === STATUS.CHECKMATE || status === STATUS.STALEMATE

/**
 * Standard algebraic notation for `move` in `state`, including the
 * disambiguation and check/mate suffixes.
 */
export function moveToSan(state, move) {
  let san

  if (move.castle) {
    san = move.castle === 'K' ? 'O-O' : 'O-O-O'
  } else {
    const type = typeOf(move.piece)
    const target = algebraic(move.to)

    if (type === 'p') {
      san = move.captured
        ? `${'abcdefgh'[fileOf(move.from)]}x${target}`
        : target
      if (move.promotion) san += `=${move.promotion.toUpperCase()}`
    } else {
      const rivals = generateLegalMoves(state).filter(
        (other) =>
          other.to === move.to &&
          other.from !== move.from &&
          typeOf(other.piece) === type,
      )

      let disambiguation = ''
      if (rivals.length > 0) {
        const sameFile = rivals.some(
          (other) => fileOf(other.from) === fileOf(move.from),
        )
        const sameRank = rivals.some(
          (other) => rankOf(other.from) === rankOf(move.from),
        )
        if (!sameFile) {
          disambiguation = 'abcdefgh'[fileOf(move.from)]
        } else if (!sameRank) {
          disambiguation = String(rankOf(move.from) + 1)
        } else {
          disambiguation = algebraic(move.from)
        }
      }

      san =
        type.toUpperCase() +
        disambiguation +
        (move.captured ? 'x' : '') +
        target
    }
  }

  const next = makeMove(state, move)
  const status = getStatus(next)
  if (status === STATUS.CHECKMATE) san += '#'
  else if (status === STATUS.CHECK) san += '+'
  return san
}
