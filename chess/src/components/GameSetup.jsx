import { useState } from 'react'
import { BLACK, WHITE } from '../engine/board.js'

const DIFFICULTY_LABELS = {
  easy: 'Easy — looks one move ahead',
  medium: 'Medium — looks two moves ahead',
  hard: 'Hard — looks three moves ahead',
}

export default function GameSetup({ onStart }) {
  const [mode, setMode] = useState('ai')
  const [side, setSide] = useState(WHITE)
  const [difficulty, setDifficulty] = useState('medium')

  return (
    <form
      className="setup"
      onSubmit={(event) => {
        event.preventDefault()
        onStart({ mode, side, difficulty })
      }}
    >
      <h1>Chess</h1>

      <fieldset>
        <legend>Opponent</legend>
        <label>
          <input
            type="radio"
            name="mode"
            value="ai"
            checked={mode === 'ai'}
            onChange={() => setMode('ai')}
          />
          Play the computer
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="human"
            checked={mode === 'human'}
            onChange={() => setMode('human')}
          />
          Two players on this device
        </label>
      </fieldset>

      {mode === 'ai' && (
        <>
          <fieldset>
            <legend>Your colour</legend>
            <label>
              <input
                type="radio"
                name="side"
                checked={side === WHITE}
                onChange={() => setSide(WHITE)}
              />
              White
            </label>
            <label>
              <input
                type="radio"
                name="side"
                checked={side === BLACK}
                onChange={() => setSide(BLACK)}
              />
              Black
            </label>
          </fieldset>

          <fieldset>
            <legend>Difficulty</legend>
            {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
              <label key={key}>
                <input
                  type="radio"
                  name="difficulty"
                  checked={difficulty === key}
                  onChange={() => setDifficulty(key)}
                />
                {label}
              </label>
            ))}
          </fieldset>
        </>
      )}

      <button type="submit" className="primary">
        Start game
      </button>
    </form>
  )
}
