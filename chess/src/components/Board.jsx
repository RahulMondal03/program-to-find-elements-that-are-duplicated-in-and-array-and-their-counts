import { algebraic, colorOf, sq, typeOf, WHITE } from '../engine/board.js'
import Piece from './Piece.jsx'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

const PIECE_NAMES = {
  k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn',
}

function describe(index, piece) {
  const name = algebraic(index)
  if (!piece) return `${name}, empty`
  const color = colorOf(piece) === WHITE ? 'white' : 'black'
  return `${name}, ${color} ${PIECE_NAMES[typeOf(piece)]}`
}

export default function Board({
  board,
  orientation,
  selected,
  targets,
  lastMove,
  checkSquare,
  onSquareClick,
  movableColor,
}) {
  const ranks = orientation === WHITE ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]
  const files = orientation === WHITE ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]

  return (
    <div className="board-frame">
      <div className="board" role="grid" aria-label="Chess board">
        {ranks.map((rank) =>
          files.map((file) => {
            const index = sq(file, rank)
            const piece = board[index]
            const isTarget = targets.has(index)
            const classes = [
              'square',
              (file + rank) % 2 === 0 ? 'dark' : 'light',
              selected === index ? 'selected' : '',
              isTarget ? (piece || targets.get(index)?.enPassant ? 'capture' : 'target') : '',
              lastMove && (lastMove.from === index || lastMove.to === index) ? 'last-move' : '',
              checkSquare === index ? 'in-check' : '',
            ]
              .filter(Boolean)
              .join(' ')

            const selectable =
              (piece && colorOf(piece) === movableColor) || isTarget

            return (
              <button
                key={index}
                type="button"
                className={classes}
                onClick={() => onSquareClick(index)}
                disabled={!selectable && selected === null}
                aria-label={describe(index, piece)}
              >
                {file === (orientation === WHITE ? 0 : 7) && (
                  <span className="coord rank">{rank + 1}</span>
                )}
                {rank === (orientation === WHITE ? 0 : 7) && (
                  <span className="coord file">{FILES[file]}</span>
                )}
                <Piece piece={piece} />
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}
