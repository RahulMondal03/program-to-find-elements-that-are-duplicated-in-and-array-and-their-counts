// Board representation.
//
// The board is a flat array of 64 entries, index 0 = a8 ... index 63 = h1.
// Pieces are FEN characters: uppercase = white, lowercase = black.

export const WHITE = 'w'
export const BLACK = 'b'

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/** Index of the square at `file` (0=a..7=h) and `rank` (0=rank 1..7=rank 8). */
export const sq = (file, rank) => (7 - rank) * 8 + file
export const fileOf = (index) => index % 8
export const rankOf = (index) => 7 - Math.floor(index / 8)
export const onBoard = (file, rank) =>
  file >= 0 && file < 8 && rank >= 0 && rank < 8

export const algebraic = (index) =>
  'abcdefgh'[fileOf(index)] + (rankOf(index) + 1)

export const fromAlgebraic = (name) =>
  sq(name.charCodeAt(0) - 97, Number(name[1]) - 1)

export const colorOf = (piece) =>
  piece == null ? null : piece === piece.toUpperCase() ? WHITE : BLACK

export const typeOf = (piece) => (piece == null ? null : piece.toLowerCase())

export const opposite = (color) => (color === WHITE ? BLACK : WHITE)

/** Piece char of `type` ('p','n',...) in `color`. */
export const pieceOf = (type, color) =>
  color === WHITE ? type.toUpperCase() : type.toLowerCase()

export function findKing(board, color) {
  const king = pieceOf('k', color)
  for (let i = 0; i < 64; i++) if (board[i] === king) return i
  return -1
}

/** Parse a FEN string into a game state. */
export function parseFen(fen) {
  const [placement, turn, castlingField, epField, halfmove, fullmove] =
    fen.trim().split(/\s+/)

  const board = new Array(64).fill(null)
  let rank = 7
  let file = 0
  for (const ch of placement) {
    if (ch === '/') {
      rank -= 1
      file = 0
    } else if (/\d/.test(ch)) {
      file += Number(ch)
    } else {
      board[sq(file, rank)] = ch
      file += 1
    }
  }

  return {
    board,
    turn: turn === 'b' ? BLACK : WHITE,
    castling: {
      K: castlingField.includes('K'),
      Q: castlingField.includes('Q'),
      k: castlingField.includes('k'),
      q: castlingField.includes('q'),
    },
    ep: epField && epField !== '-' ? fromAlgebraic(epField) : null,
    halfmove: Number(halfmove ?? 0),
    fullmove: Number(fullmove ?? 1),
  }
}

/** Serialise a game state back to FEN. */
export function toFen(state) {
  let placement = ''
  for (let rank = 7; rank >= 0; rank--) {
    let empty = 0
    for (let file = 0; file < 8; file++) {
      const piece = state.board[sq(file, rank)]
      if (piece == null) {
        empty += 1
      } else {
        if (empty) placement += empty
        empty = 0
        placement += piece
      }
    }
    if (empty) placement += empty
    if (rank > 0) placement += '/'
  }

  const { K, Q, k, q } = state.castling
  const castling =
    (K ? 'K' : '') + (Q ? 'Q' : '') + (k ? 'k' : '') + (q ? 'q' : '') || '-'

  return [
    placement,
    state.turn,
    castling,
    state.ep == null ? '-' : algebraic(state.ep),
    state.halfmove,
    state.fullmove,
  ].join(' ')
}

export const initialState = () => parseFen(START_FEN)
