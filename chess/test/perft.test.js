import { describe, expect, it } from 'vitest'
import { initialState, parseFen } from '../src/engine/board.js'
import { perft } from '../src/engine/moves.js'

// Node counts from the standard perft positions. They only match if
// castling, en passant, promotion and check evasion are all handled.
describe('perft', () => {
  it('matches the initial position', () => {
    const state = initialState()
    expect(perft(state, 1)).toBe(20)
    expect(perft(state, 2)).toBe(400)
    expect(perft(state, 3)).toBe(8902)
    expect(perft(state, 4)).toBe(197281)
  })

  it('matches "kiwipete" (castling and pins)', () => {
    const state = parseFen(
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    )
    expect(perft(state, 1)).toBe(48)
    expect(perft(state, 2)).toBe(2039)
    expect(perft(state, 3)).toBe(97862)
  })

  it('matches position 3 (en passant edge cases)', () => {
    const state = parseFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1')
    expect(perft(state, 1)).toBe(14)
    expect(perft(state, 2)).toBe(191)
    expect(perft(state, 3)).toBe(2812)
    expect(perft(state, 4)).toBe(43238)
  })

  it('matches position 4 (promotions)', () => {
    const state = parseFen(
      'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    )
    expect(perft(state, 1)).toBe(6)
    expect(perft(state, 2)).toBe(264)
    expect(perft(state, 3)).toBe(9467)
  })
})
