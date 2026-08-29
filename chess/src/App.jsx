import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BLACK,
  WHITE,
  colorOf,
  findKing,
  initialState,
  opposite,
  toFen,
} from './engine/board.js'
import { generateLegalMoves, makeMove } from './engine/moves.js'
import { STATUS, getStatus, isGameOver, moveToSan } from './engine/game.js'
import { chooseMove } from './engine/ai.js'
import Board from './components/Board.jsx'
import CapturedPieces from './components/CapturedPieces.jsx'
import GameSetup from './components/GameSetup.jsx'
import MoveList from './components/MoveList.jsx'
import PromotionDialog from './components/PromotionDialog.jsx'

const NEW_GAME = [{ state: initialState(), move: null, san: null }]

const colorName = (color) => (color === WHITE ? 'White' : 'Black')

export default function App() {
  const [config, setConfig] = useState(null)
  const [history, setHistory] = useState(NEW_GAME)
  const [selected, setSelected] = useState(null)
  const [pendingPromotion, setPendingPromotion] = useState(null)
  const [flipped, setFlipped] = useState(false)
  const [thinking, setThinking] = useState(false)

  const current = history[history.length - 1].state
  const lastMove = history[history.length - 1].move
  const playedMoves = useMemo(
    () => history.slice(1).map((entry) => entry.move),
    [history],
  )

  const legalMoves = useMemo(() => generateLegalMoves(current), [current])
  const status = useMemo(
    () => getStatus(current, legalMoves),
    [current, legalMoves],
  )
  const over = isGameOver(status)

  const targets = useMemo(() => {
    const map = new Map()
    if (selected == null) return map
    for (const move of legalMoves) {
      if (move.from === selected && !map.has(move.to)) map.set(move.to, move)
    }
    return map
  }, [legalMoves, selected])

  const humanToMove =
    config != null && (config.mode === 'human' || current.turn === config.side)

  const play = useCallback((move) => {
    setHistory((entries) => {
      const state = entries[entries.length - 1].state
      return [
        ...entries,
        { state: makeMove(state, move), move, san: moveToSan(state, move) },
      ]
    })
    setSelected(null)
  }, [])

  // Let the computer answer once it is its turn.
  useEffect(() => {
    if (config?.mode !== 'ai' || over || current.turn === config.side) return
    setThinking(true)
    const timer = setTimeout(() => {
      const move = chooseMove(current, config.difficulty)
      if (move) play(move)
      setThinking(false)
    }, 300)
    return () => {
      clearTimeout(timer)
      setThinking(false)
    }
  }, [config, current, over, play])

  function handleSquareClick(index) {
    if (over || thinking || !humanToMove || pendingPromotion) return

    if (selected != null) {
      const move = targets.get(index)
      if (move) {
        if (move.promotion) {
          setPendingPromotion({ from: selected, to: index })
          setSelected(null)
        } else {
          play(move)
        }
        return
      }
    }

    const piece = current.board[index]
    if (piece && colorOf(piece) === current.turn) {
      setSelected(index === selected ? null : index)
    } else {
      setSelected(null)
    }
  }

  function completePromotion(type) {
    const move = legalMoves.find(
      (candidate) =>
        candidate.from === pendingPromotion.from &&
        candidate.to === pendingPromotion.to &&
        candidate.promotion === type,
    )
    setPendingPromotion(null)
    if (move) play(move)
  }

  function undo() {
    setSelected(null)
    setPendingPromotion(null)
    setHistory((entries) => {
      let next = entries
      do {
        next = next.slice(0, -1)
      } while (
        next.length > 1 &&
        config?.mode === 'ai' &&
        next[next.length - 1].state.turn !== config.side
      )
      return next.length ? next : NEW_GAME
    })
  }

  function restart() {
    setHistory(NEW_GAME)
    setSelected(null)
    setPendingPromotion(null)
    setThinking(false)
  }

  if (!config) {
    return (
      <main className="app centered">
        <GameSetup
          onStart={(chosen) => {
            restart()
            setFlipped(chosen.mode === 'ai' && chosen.side === BLACK)
            setConfig(chosen)
          }}
        />
      </main>
    )
  }

  const orientation = flipped ? BLACK : WHITE
  const topColor = orientation === WHITE ? BLACK : WHITE
  const checkSquare =
    status === STATUS.CHECK || status === STATUS.CHECKMATE
      ? findKing(current.board, current.turn)
      : null

  let message
  if (status === STATUS.CHECKMATE) {
    message = `Checkmate — ${colorName(opposite(current.turn))} wins`
  } else if (status === STATUS.STALEMATE) {
    message = 'Stalemate — the game is a draw'
  } else if (thinking) {
    message = 'Computer is thinking…'
  } else {
    message =
      `${colorName(current.turn)} to move` +
      (status === STATUS.CHECK ? ' — check!' : '')
  }

  const playerLabel = (color) => {
    if (config.mode === 'human') return colorName(color)
    return color === config.side
      ? `${colorName(color)} (you)`
      : `${colorName(color)} (computer, ${config.difficulty})`
  }

  return (
    <main className="app">
      <div className="game">
        <div className="player-bar">
          <span className="player-name">{playerLabel(topColor)}</span>
          <CapturedPieces
            board={current.board}
            player={topColor}
            moves={playedMoves}
          />
        </div>

        <Board
          board={current.board}
          orientation={orientation}
          selected={selected}
          targets={targets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          onSquareClick={handleSquareClick}
          movableColor={humanToMove && !over && !thinking ? current.turn : null}
        />

        <div className="player-bar">
          <span className="player-name">{playerLabel(opposite(topColor))}</span>
          <CapturedPieces
            board={current.board}
            player={opposite(topColor)}
            moves={playedMoves}
          />
        </div>
      </div>

      <aside className="panel">
        <p className={`status ${over ? 'over' : ''}`}>{message}</p>

        <div className="controls">
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 1 || thinking}
          >
            Undo
          </button>
          <button type="button" onClick={() => setFlipped((value) => !value)}>
            Flip board
          </button>
          <button type="button" onClick={restart}>
            Restart
          </button>
          <button type="button" onClick={() => setConfig(null)}>
            New game
          </button>
        </div>

        <MoveList moves={history.slice(1).map((entry) => entry.san)} />

        <p className="fen" title="Position in Forsyth–Edwards Notation">
          {toFen(current)}
        </p>
      </aside>

      {pendingPromotion && (
        <PromotionDialog
          color={current.turn}
          onSelect={completePromotion}
          onCancel={() => setPendingPromotion(null)}
        />
      )}
    </main>
  )
}
