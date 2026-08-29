// Move generation and move application.

import {
  WHITE,
  BLACK,
  sq,
  fileOf,
  rankOf,
  onBoard,
  colorOf,
  typeOf,
  opposite,
  pieceOf,
  findKing,
} from './board.js'

const KNIGHT_DELTAS = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
]
const KING_DELTAS = [
  [1, 0], [1, 1], [0, 1], [-1, 1],
  [-1, 0], [-1, -1], [0, -1], [1, -1],
]
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]

const PROMOTION_PIECES = ['q', 'r', 'b', 'n']

function makeMoveObject(from, to, piece, captured, extra = {}) {
  return {
    from,
    to,
    piece,
    captured: captured ?? null,
    promotion: null,
    castle: null,
    enPassant: false,
    doublePawn: false,
    ...extra,
  }
}

/** Is `target` attacked by any piece of colour `by`? */
export function isSquareAttacked(board, target, by) {
  const tf = fileOf(target)
  const tr = rankOf(target)

  // Pawns: a pawn of colour `by` sitting one rank "behind" the target attacks it.
  const pawnRank = tr - (by === WHITE ? 1 : -1)
  for (const df of [-1, 1]) {
    if (!onBoard(tf + df, pawnRank)) continue
    const piece = board[sq(tf + df, pawnRank)]
    if (piece && colorOf(piece) === by && typeOf(piece) === 'p') return true
  }

  for (const [df, dr] of KNIGHT_DELTAS) {
    if (!onBoard(tf + df, tr + dr)) continue
    const piece = board[sq(tf + df, tr + dr)]
    if (piece && colorOf(piece) === by && typeOf(piece) === 'n') return true
  }

  for (const [df, dr] of KING_DELTAS) {
    if (!onBoard(tf + df, tr + dr)) continue
    const piece = board[sq(tf + df, tr + dr)]
    if (piece && colorOf(piece) === by && typeOf(piece) === 'k') return true
  }

  const slide = (dirs, types) => {
    for (const [df, dr] of dirs) {
      let f = tf + df
      let r = tr + dr
      while (onBoard(f, r)) {
        const piece = board[sq(f, r)]
        if (piece) {
          if (colorOf(piece) === by && types.includes(typeOf(piece))) return true
          break
        }
        f += df
        r += dr
      }
    }
    return false
  }

  if (slide(BISHOP_DIRS, ['b', 'q'])) return true
  if (slide(ROOK_DIRS, ['r', 'q'])) return true
  return false
}

export function isInCheck(state, color = state.turn) {
  const king = findKing(state.board, color)
  if (king === -1) return false
  return isSquareAttacked(state.board, king, opposite(color))
}

function pawnMoves(state, from, piece, moves) {
  const { board, ep } = state
  const color = colorOf(piece)
  const dir = color === WHITE ? 1 : -1
  const startRank = color === WHITE ? 1 : 6
  const promoRank = color === WHITE ? 7 : 0
  const f = fileOf(from)
  const r = rankOf(from)

  const push = (to, extra) => {
    if (rankOf(to) === promoRank) {
      for (const promotion of PROMOTION_PIECES) {
        moves.push(makeMoveObject(from, to, piece, extra?.captured, {
          ...extra,
          promotion,
        }))
      }
    } else {
      moves.push(makeMoveObject(from, to, piece, extra?.captured, extra))
    }
  }

  // Forward pushes.
  if (onBoard(f, r + dir) && board[sq(f, r + dir)] == null) {
    push(sq(f, r + dir), {})
    if (r === startRank && board[sq(f, r + 2 * dir)] == null) {
      moves.push(
        makeMoveObject(from, sq(f, r + 2 * dir), piece, null, {
          doublePawn: true,
        }),
      )
    }
  }

  // Captures, including en passant.
  for (const df of [-1, 1]) {
    if (!onBoard(f + df, r + dir)) continue
    const to = sq(f + df, r + dir)
    const target = board[to]
    if (target && colorOf(target) !== color) {
      push(to, { captured: target })
    } else if (target == null && ep != null && to === ep) {
      moves.push(
        makeMoveObject(from, to, piece, pieceOf('p', opposite(color)), {
          enPassant: true,
        }),
      )
    }
  }
}

function stepMoves(state, from, piece, deltas, moves) {
  const color = colorOf(piece)
  const f = fileOf(from)
  const r = rankOf(from)
  for (const [df, dr] of deltas) {
    if (!onBoard(f + df, r + dr)) continue
    const to = sq(f + df, r + dr)
    const target = state.board[to]
    if (target && colorOf(target) === color) continue
    moves.push(makeMoveObject(from, to, piece, target))
  }
}

function slideMoves(state, from, piece, dirs, moves) {
  const color = colorOf(piece)
  const f0 = fileOf(from)
  const r0 = rankOf(from)
  for (const [df, dr] of dirs) {
    let f = f0 + df
    let r = r0 + dr
    while (onBoard(f, r)) {
      const to = sq(f, r)
      const target = state.board[to]
      if (target == null) {
        moves.push(makeMoveObject(from, to, piece, null))
      } else {
        if (colorOf(target) !== color) {
          moves.push(makeMoveObject(from, to, piece, target))
        }
        break
      }
      f += df
      r += dr
    }
  }
}

function castlingMoves(state, from, piece, moves) {
  const color = colorOf(piece)
  const { board, castling } = state
  const rank = color === WHITE ? 0 : 7
  if (from !== sq(4, rank)) return

  const enemy = opposite(color)
  if (isSquareAttacked(board, from, enemy)) return

  const kingSide = color === WHITE ? castling.K : castling.k
  const queenSide = color === WHITE ? castling.Q : castling.q

  if (
    kingSide &&
    board[sq(7, rank)] === pieceOf('r', color) &&
    board[sq(5, rank)] == null &&
    board[sq(6, rank)] == null &&
    !isSquareAttacked(board, sq(5, rank), enemy) &&
    !isSquareAttacked(board, sq(6, rank), enemy)
  ) {
    moves.push(
      makeMoveObject(from, sq(6, rank), piece, null, { castle: 'K' }),
    )
  }

  if (
    queenSide &&
    board[sq(0, rank)] === pieceOf('r', color) &&
    board[sq(1, rank)] == null &&
    board[sq(2, rank)] == null &&
    board[sq(3, rank)] == null &&
    !isSquareAttacked(board, sq(3, rank), enemy) &&
    !isSquareAttacked(board, sq(2, rank), enemy)
  ) {
    moves.push(
      makeMoveObject(from, sq(2, rank), piece, null, { castle: 'Q' }),
    )
  }
}

/** All pseudo-legal moves (king may be left in check). */
export function generatePseudoMoves(state, onlyFrom = null) {
  const moves = []
  for (let from = 0; from < 64; from++) {
    if (onlyFrom != null && from !== onlyFrom) continue
    const piece = state.board[from]
    if (!piece || colorOf(piece) !== state.turn) continue

    switch (typeOf(piece)) {
      case 'p':
        pawnMoves(state, from, piece, moves)
        break
      case 'n':
        stepMoves(state, from, piece, KNIGHT_DELTAS, moves)
        break
      case 'b':
        slideMoves(state, from, piece, BISHOP_DIRS, moves)
        break
      case 'r':
        slideMoves(state, from, piece, ROOK_DIRS, moves)
        break
      case 'q':
        slideMoves(state, from, piece, [...BISHOP_DIRS, ...ROOK_DIRS], moves)
        break
      case 'k':
        stepMoves(state, from, piece, KING_DELTAS, moves)
        castlingMoves(state, from, piece, moves)
        break
      default:
        break
    }
  }
  return moves
}

/** Apply a move, returning a new state. The move is not validated. */
export function makeMove(state, move) {
  const board = state.board.slice()
  const us = state.turn
  const them = opposite(us)

  board[move.from] = null
  board[move.to] = move.promotion ? pieceOf(move.promotion, us) : move.piece

  if (move.enPassant) {
    board[sq(fileOf(move.to), rankOf(move.from))] = null
  }

  if (move.castle) {
    const rank = rankOf(move.from)
    if (move.castle === 'K') {
      board[sq(5, rank)] = board[sq(7, rank)]
      board[sq(7, rank)] = null
    } else {
      board[sq(3, rank)] = board[sq(0, rank)]
      board[sq(0, rank)] = null
    }
  }

  const castling = { ...state.castling }
  if (typeOf(move.piece) === 'k') {
    if (us === WHITE) {
      castling.K = false
      castling.Q = false
    } else {
      castling.k = false
      castling.q = false
    }
  }
  // A rook leaving — or being captured on — a corner kills that castling right.
  for (const square of [move.from, move.to]) {
    if (square === sq(0, 0)) castling.Q = false
    if (square === sq(7, 0)) castling.K = false
    if (square === sq(0, 7)) castling.q = false
    if (square === sq(7, 7)) castling.k = false
  }

  const isPawn = typeOf(move.piece) === 'p'

  return {
    board,
    turn: them,
    castling,
    ep: move.doublePawn
      ? sq(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2)
      : null,
    halfmove: isPawn || move.captured ? 0 : state.halfmove + 1,
    fullmove: us === BLACK ? state.fullmove + 1 : state.fullmove,
  }
}

/** All fully legal moves for the side to move. */
export function generateLegalMoves(state, onlyFrom = null) {
  const legal = []
  for (const move of generatePseudoMoves(state, onlyFrom)) {
    const next = makeMove(state, move)
    if (!isInCheck(next, state.turn)) legal.push(move)
  }
  return legal
}

/** Find the legal move matching from/to (and promotion piece, if any). */
export function findMove(state, from, to, promotion = null) {
  return (
    generateLegalMoves(state, from).find(
      (move) =>
        move.to === to &&
        (promotion == null || move.promotion === promotion),
    ) ?? null
  )
}

/** Count leaf nodes at `depth` — the standard correctness check for move gen. */
export function perft(state, depth) {
  if (depth === 0) return 1
  const moves = generateLegalMoves(state)
  if (depth === 1) return moves.length
  let nodes = 0
  for (const move of moves) nodes += perft(makeMove(state, move), depth - 1)
  return nodes
}
