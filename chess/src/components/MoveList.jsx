import { useEffect, useRef } from 'react'

/** The game score in two columns, scrolled to the latest move. */
export default function MoveList({ moves }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [moves.length])

  const pairs = []
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ number: i / 2 + 1, white: moves[i], black: moves[i + 1] })
  }

  return (
    <div className="move-list">
      <h2>Moves</h2>
      {pairs.length === 0 ? (
        <p className="empty">No moves yet.</p>
      ) : (
        <ol>
          {pairs.map((pair) => (
            <li key={pair.number}>
              <span className="number">{pair.number}.</span>
              <span className="san">{pair.white}</span>
              <span className="san">{pair.black ?? ''}</span>
            </li>
          ))}
        </ol>
      )}
      <div ref={endRef} />
    </div>
  )
}
