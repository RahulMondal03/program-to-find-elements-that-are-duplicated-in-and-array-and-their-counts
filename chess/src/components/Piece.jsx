import { colorOf, typeOf } from '../engine/board.js'

// The solid glyphs render more evenly than the outlined ones, so both
// colours use them and CSS supplies the fill and outline.
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }

export default function Piece({ piece }) {
  if (!piece) return null
  return (
    <span className={`piece piece-${colorOf(piece)}`} aria-hidden="true">
      {GLYPHS[typeOf(piece)]}
    </span>
  )
}
