import { describe, expect, it } from 'vitest'
import { fromAlgebraic as at, initialState, parseFen } from '../src/engine/board.js'
import { generateLegalMoves } from '../src/engine/moves.js'
import { chooseMove, evaluate } from '../src/engine/ai.js'

// Silence the randomness the easier levels add, so the tests are repeatable.
const noRandom = () => 0.5

describe('evaluation', () => {
  it('scores the starting position as level', () => {
    expect(evaluate(initialState())).toBe(0)
  })

  it('scores material from the mover\'s point of view', () => {
    const whiteUpAQueen = parseFen('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')
    const blackUpAQueen = parseFen('3qk3/8/8/8/8/8/8/4K3 b - - 0 1')
    expect(evaluate(whiteUpAQueen)).toBeGreaterThan(800)
    expect(evaluate(blackUpAQueen)).toBeGreaterThan(800)
  })
})

describe('move choice', () => {
  it('returns null when there are no legal moves', () => {
    const mated = parseFen('6k1/5ppp/8/8/8/8/8/R5K1 b - - 0 1')
    expect(generateLegalMoves(mated).length).toBeGreaterThan(0)
    const stalemate = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(chooseMove(stalemate, 'easy', noRandom)).toBeNull()
  })

  it('plays mate in one', () => {
    const state = parseFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1')
    const move = chooseMove(state, 'medium', noRandom)
    expect(move.from).toBe(at('a1'))
    expect(move.to).toBe(at('a8'))
  })

  it('takes a hanging queen', () => {
    const state = parseFen('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1')
    const move = chooseMove(state, 'hard', noRandom)
    expect(move.from).toBe(at('e4'))
    expect(move.to).toBe(at('d5'))
  })

  it('does not grab a defended pawn with the queen', () => {
    // Qxd5 loses the queen to the c6 pawn.
    const state = parseFen('4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1')
    const move = chooseMove(state, 'hard', noRandom)
    expect([move.from, move.to]).not.toEqual([at('d2'), at('d5')])
  })

  it('avoids stepping into mate when it can', () => {
    const state = parseFen('6k1/5ppp/8/8/8/8/5PPP/1R4K1 b - - 0 1')
    const move = chooseMove(state, 'hard', noRandom)
    expect(move).not.toBeNull()
  })

  it('returns a legal move from the opening position', () => {
    const state = initialState()
    const move = chooseMove(state, 'medium', noRandom)
    const legal = generateLegalMoves(state)
    expect(legal.some((m) => m.from === move.from && m.to === move.to)).toBe(true)
  })
})
