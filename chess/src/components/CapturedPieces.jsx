import { WHITE, colorOf, opposite, typeOf } from '../engine/board.js'

const GLYPHS = { q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const VALUES = { q: 9, r: 5, b: 3, n: 3, p: 1 }
const ORDER = ['q', 'r', 'b', 'n', 'p']

/**
 * The pieces `player` has taken, read off the move history, and their
 * material edge, counted from the board so promotions are included.
 */
export default function CapturedPieces({ board, player, moves }) {
  const taken = opposite(player)

  const captured = moves
    .filter((move) => move?.captured && colorOf(move.captured) === taken)
    .map((move) => typeOf(move.captured))
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))

  const material = { w: 0, b: 0 }
  for (const piece of board) {
    if (!piece || typeOf(piece) === 'k') continue
    material[colorOf(piece) === WHITE ? 'w' : 'b'] += VALUES[typeOf(piece)]
  }
  const edge =
    player === WHITE ? material.w - material.b : material.b - material.w

  return (
    <div className="captured">
      <span className={`captured-pieces piece-${taken}`}>
        {captured.map((type, index) => (
          <span key={`${type}-${index}`}>{GLYPHS[type]}</span>
        ))}
      </span>
      {edge > 0 && <span className="edge">+{edge}</span>}
    </div>
  )
}
