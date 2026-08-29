import { describe, expect, it } from 'vitest'
import {
  BLACK,
  WHITE,
  fromAlgebraic as at,
  initialState,
  parseFen,
  toFen,
} from '../src/engine/board.js'
import {
  findMove,
  generateLegalMoves,
  isInCheck,
  isSquareAttacked,
  makeMove,
} from '../src/engine/moves.js'

const movesFrom = (state, square) =>
  generateLegalMoves(state, at(square)).map((move) => move.to)

const play = (state, from, to, promotion = null) => {
  const move = findMove(state, at(from), at(to), promotion)
  expect(move, `${from}${to} should be legal`).not.toBeNull()
  return makeMove(state, move)
}

describe('FEN', () => {
  it('round-trips the starting position', () => {
    expect(toFen(initialState())).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    )
  })

  it('round-trips a midgame position', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
    expect(toFen(parseFen(fen))).toBe(fen)
  })
})

describe('piece movement', () => {
  it('gives each knight two opening moves', () => {
    expect(movesFrom(initialState(), 'b1').sort()).toEqual(
      [at('a3'), at('c3')].sort(),
    )
  })

  it('lets a pawn advance one or two squares from its start', () => {
    expect(movesFrom(initialState(), 'e2').sort()).toEqual(
      [at('e3'), at('e4')].sort(),
    )
  })

  it('blocks a double push when the intervening square is occupied', () => {
    const state = parseFen('4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1')
    expect(movesFrom(state, 'e2')).toEqual([])
  })

  it('slides a rook until it hits a piece, capturing enemies', () => {
    const state = parseFen('4k3/8/8/8/8/8/3r4/3RK3 w - - 0 1')
    expect(movesFrom(state, 'd1').sort()).toEqual(
      [at('a1'), at('b1'), at('c1'), at('d2')].sort(),
    )
  })
})

describe('check', () => {
  it('detects an attacked square', () => {
    const state = parseFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    expect(isSquareAttacked(state.board, at('a8'), WHITE)).toBe(true)
    expect(isSquareAttacked(state.board, at('b8'), WHITE)).toBe(false)
  })

  it('forbids leaving the king in check', () => {
    // The e-file bishop is pinned by the rook on e8.
    const state = parseFen('4r2k/8/8/8/8/4B3/8/4K3 w - - 0 1')
    expect(movesFrom(state, 'e3').sort()).toEqual([])
  })

  it('only allows moves that answer a check', () => {
    const state = parseFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')
    const destinations = generateLegalMoves(state).map((move) => move.to)
    expect(destinations.sort()).toEqual([at('d1'), at('e2'), at('f1')].sort())
  })

  it('reports check for the side to move', () => {
    expect(isInCheck(parseFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1'))).toBe(true)
    expect(isInCheck(initialState())).toBe(false)
  })
})

describe('castling', () => {
  const both = '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1'

  it('offers both sides when the path is clear', () => {
    expect(movesFrom(parseFen(both), 'e1')).toContain(at('g1'))
    expect(movesFrom(parseFen(both), 'e1')).toContain(at('c1'))
  })

  it('moves the rook alongside the king', () => {
    const after = play(parseFen(both), 'e1', 'g1')
    expect(after.board[at('g1')]).toBe('K')
    expect(after.board[at('f1')]).toBe('R')
    expect(after.board[at('h1')]).toBeNull()

    const queenSide = play(parseFen(both), 'e1', 'c1')
    expect(queenSide.board[at('c1')]).toBe('K')
    expect(queenSide.board[at('d1')]).toBe('R')
    expect(queenSide.board[at('a1')]).toBeNull()
  })

  it('is forbidden while in check', () => {
    const state = parseFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1')
    const inCheck = parseFen('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1')
    expect(movesFrom(state, 'e1')).toContain(at('g1'))
    expect(movesFrom(inCheck, 'e1')).not.toContain(at('g1'))
  })

  it('is forbidden through an attacked square', () => {
    const state = parseFen('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1')
    expect(movesFrom(state, 'e1')).not.toContain(at('g1'))
    expect(movesFrom(state, 'e1')).toContain(at('c1'))
  })

  it('is forbidden when a piece stands in the way', () => {
    const state = parseFen('4k3/8/8/8/8/8/8/R2BK1NR w KQ - 0 1')
    expect(movesFrom(state, 'e1')).not.toContain(at('g1'))
    expect(movesFrom(state, 'e1')).not.toContain(at('c1'))
  })

  it('drops the rights once the king moves', () => {
    const after = play(parseFen(both), 'e1', 'e2')
    expect(after.castling.K).toBe(false)
    expect(after.castling.Q).toBe(false)
  })

  it('drops one right when that rook moves', () => {
    const after = play(parseFen(both), 'h1', 'h2')
    expect(after.castling.K).toBe(false)
    expect(after.castling.Q).toBe(true)
  })

  it('drops the right when the rook is captured on its home square', () => {
    const state = parseFen('4k3/6b1/8/8/8/8/8/R3K2R b KQ - 0 1')
    const after = play(state, 'g7', 'a1')
    expect(after.castling.Q).toBe(false)
    expect(after.castling.K).toBe(true)
  })
})

describe('en passant', () => {
  it('sets the target square after a double push', () => {
    const after = play(initialState(), 'e2', 'e4')
    expect(after.ep).toBe(at('e3'))
  })

  it('clears the target square after any other move', () => {
    const after = play(play(initialState(), 'e2', 'e4'), 'b8', 'c6')
    expect(after.ep).toBeNull()
  })

  it('captures the passing pawn, not the destination square', () => {
    const state = parseFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1')
    const after = play(state, 'e5', 'd6')
    expect(after.board[at('d6')]).toBe('P')
    expect(after.board[at('d5')]).toBeNull()
  })

  it('is only available on the move immediately after the push', () => {
    const state = parseFen('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1')
    const pushed = play(state, 'd7', 'd5')
    expect(movesFrom(pushed, 'e5')).toContain(at('d6'))

    const later = play(play(pushed, 'e1', 'e2'), 'e8', 'e7')
    expect(movesFrom(later, 'e5')).not.toContain(at('d6'))
  })

  it('is illegal when it would expose the king', () => {
    // Taking en passant clears both pawns off the fifth rank, and the rook
    // on h5 would then give check along the rank.
    const state = parseFen('8/8/8/K1pP3r/8/8/8/7k w - c6 0 1')
    expect(movesFrom(state, 'd5')).not.toContain(at('c6'))
  })
})

describe('promotion', () => {
  it('offers four pieces', () => {
    const state = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
    const promotions = generateLegalMoves(state, at('a7')).map((m) => m.promotion)
    expect(promotions.sort()).toEqual(['b', 'n', 'q', 'r'])
  })

  it('places the chosen piece', () => {
    const state = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
    expect(play(state, 'a7', 'a8', 'n').board[at('a8')]).toBe('N')
    expect(play(state, 'a7', 'a8', 'q').board[at('a8')]).toBe('Q')
  })

  it('promotes black pawns to lowercase pieces', () => {
    const state = parseFen('4k3/8/8/8/8/8/p7/4K3 b - - 0 1')
    expect(play(state, 'a2', 'a1', 'q').board[at('a1')]).toBe('q')
  })

  it('can promote by capturing', () => {
    const state = parseFen('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1')
    const after = play(state, 'a7', 'b8', 'q')
    expect(after.board[at('b8')]).toBe('Q')
    expect(after.turn).toBe(BLACK)
  })
})

describe('move counters', () => {
  it('resets the halfmove clock on pawn moves and captures', () => {
    const state = parseFen('4k3/8/8/8/8/7n/8/4K2R w K - 8 20')
    expect(play(state, 'h1', 'h3').halfmove).toBe(0)
    expect(play(state, 'h1', 'h2').halfmove).toBe(9)
  })

  it('increments the fullmove number after black moves', () => {
    const white = play(initialState(), 'e2', 'e4')
    expect(white.fullmove).toBe(1)
    expect(play(white, 'e7', 'e5').fullmove).toBe(2)
  })
})
