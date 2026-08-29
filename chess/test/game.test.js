import { describe, expect, it } from 'vitest'
import { fromAlgebraic as at, initialState, parseFen } from '../src/engine/board.js'
import { findMove, makeMove } from '../src/engine/moves.js'
import { STATUS, getStatus, isGameOver, moveToSan } from '../src/engine/game.js'

/** Play a list of "e2e4"-style moves, collecting the SAN for each. */
function playLine(state, line) {
  const sans = []
  for (const text of line) {
    const promotion = text.length > 4 ? text[4] : null
    const move = findMove(state, at(text.slice(0, 2)), at(text.slice(2, 4)), promotion)
    expect(move, `${text} should be legal`).not.toBeNull()
    sans.push(moveToSan(state, move))
    state = makeMove(state, move)
  }
  return { state, sans }
}

describe('game status', () => {
  it('starts in play', () => {
    expect(getStatus(initialState())).toBe(STATUS.PLAYING)
  })

  it('recognises check', () => {
    const state = parseFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')
    expect(getStatus(state)).toBe(STATUS.CHECK)
    expect(isGameOver(getStatus(state))).toBe(false)
  })

  it('recognises checkmate (fool\'s mate)', () => {
    const { state } = playLine(initialState(), ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
    expect(getStatus(state)).toBe(STATUS.CHECKMATE)
    expect(isGameOver(getStatus(state))).toBe(true)
  })

  it('recognises a back-rank mate', () => {
    const state = parseFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1')
    const { state: mated } = playLine(state, ['a1a8'])
    expect(getStatus(mated)).toBe(STATUS.CHECKMATE)
  })

  it('recognises stalemate', () => {
    const state = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(getStatus(state)).toBe(STATUS.STALEMATE)
    expect(isGameOver(getStatus(state))).toBe(true)
  })
})

describe('algebraic notation', () => {
  it('writes the opening moves', () => {
    const { sans } = playLine(initialState(), ['e2e4', 'e7e5', 'g1f3', 'b8c6'])
    expect(sans).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })

  it('marks captures', () => {
    const state = parseFen('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
    const { sans } = playLine(state, ['e4d5', 'd8d5'])
    expect(sans).toEqual(['exd5', 'Qxd5'])
  })

  it('marks check and mate', () => {
    const { sans } = playLine(initialState(), ['f2f3', 'e7e5', 'g2g4', 'd8h4'])
    expect(sans[3]).toBe('Qh4#')

    const check = parseFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')
    expect(playLine(check, ['a1a8']).sans).toEqual(['Ra8+'])
  })

  it('writes castling', () => {
    const state = parseFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1')
    expect(playLine(state, ['e1g1']).sans).toEqual(['O-O'])
    expect(playLine(state, ['e1c1']).sans).toEqual(['O-O-O'])
  })

  it('writes promotions', () => {
    const state = parseFen('8/P7/8/4k3/8/8/8/4K3 w - - 0 1')
    expect(playLine(state, ['a7a8q']).sans).toEqual(['a8=Q'])
    expect(playLine(state, ['a7a8n']).sans).toEqual(['a8=N'])

    // A promotion that gives check carries the suffix too.
    const checking = parseFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1')
    expect(playLine(checking, ['a7a8q']).sans).toEqual(['a8=Q+'])
  })

  it('disambiguates by file when two pieces can reach a square', () => {
    const state = parseFen('4k3/8/8/8/8/5N1N/8/4K3 w - - 0 1')
    expect(playLine(state, ['f3g5']).sans).toEqual(['Nfg5'])
    expect(playLine(state, ['h3g5']).sans).toEqual(['Nhg5'])
  })

  it('disambiguates by rank when the files match', () => {
    const state = parseFen('4k3/5N2/8/8/8/5N2/8/4K3 w - - 0 1')
    expect(playLine(state, ['f3e5']).sans).toEqual(['N3e5'])
    expect(playLine(state, ['f7e5']).sans).toEqual(['N7e5'])
  })
})
