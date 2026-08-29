import { WHITE } from '../engine/board.js'

const GLYPHS = {
  q: { w: '♛', b: '♛' },
  r: { w: '♜', b: '♜' },
  b: { w: '♝', b: '♝' },
  n: { w: '♞', b: '♞' },
}

const NAMES = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }

export default function PromotionDialog({ color, onSelect, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Choose promotion piece"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Promote to</h2>
        <div className="promotion-choices">
          {['q', 'r', 'b', 'n'].map((type) => (
            <button
              key={type}
              type="button"
              className="promotion-choice"
              onClick={() => onSelect(type)}
              aria-label={NAMES[type]}
            >
              <span className={`piece piece-${color}`}>
                {GLYPHS[type][color === WHITE ? 'w' : 'b']}
              </span>
              <span className="promotion-name">{NAMES[type]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
