import React from 'react'

type EditorRow = {
  rowId: string
  playerId: string
  singlesWins: number
  singlesLosses: number
  doublesWins: number
  doublesLosses: number
}

type PlayerOption = { id: string; displayName: string }

type Props = {
  rows: EditorRow[]
  playerOptions: PlayerOption[]
  getPlayerSelectHandler: (rowId: string) => (e: React.ChangeEvent<HTMLSelectElement>) => void
  getStatInputHandler: (rowId: string, field: keyof EditorRow, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => void
  onAddRow: () => void
  onRemoveRow: (rowId: string) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
  submitting: boolean
  canAdd: boolean
  MAX_SINGLES: number
  MAX_DOUBLES: number
}

const PlayerStatsEditor = ({
  rows,
  playerOptions,
  getPlayerSelectHandler,
  getStatInputHandler,
  onAddRow,
  onRemoveRow,
  onSubmit,
  onCancel,
  submitting,
  canAdd,
  MAX_SINGLES,
  MAX_DOUBLES,
}: Props) => {
  return (
    <form className="player-result-form" onSubmit={onSubmit}>
      <div className="player-result-grid">
        {rows.map((row) => (
          <div key={row.rowId} className="player-result-row">
            <label>
              Player
              <select
                value={row.playerId}
                onChange={getPlayerSelectHandler(row.rowId)}
                disabled={playerOptions.length === 0}
              >
                <option value="">Select player…</option>
                {playerOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </label>
            <label>
              Singles Wins
              <input
                type="number"
                min={0}
                max={MAX_SINGLES}
                value={row.singlesWins}
                onChange={getStatInputHandler(row.rowId, 'singlesWins', MAX_SINGLES)}
              />
            </label>
            <label>
              Singles Losses
              <input
                type="number"
                min={0}
                max={MAX_SINGLES}
                value={row.singlesLosses}
                onChange={getStatInputHandler(row.rowId, 'singlesLosses', MAX_SINGLES)}
              />
            </label>
            <label>
              Doubles Wins
              <input
                type="number"
                min={0}
                max={MAX_DOUBLES}
                value={row.doublesWins}
                onChange={getStatInputHandler(row.rowId, 'doublesWins', MAX_DOUBLES)}
              />
            </label>
            <label>
              Doubles Losses
              <input
                type="number"
                min={0}
                max={MAX_DOUBLES}
                value={row.doublesLosses}
                onChange={getStatInputHandler(row.rowId, 'doublesLosses', MAX_DOUBLES)}
              />
            </label>
            <button type="button" className="ghost-button" onClick={() => onRemoveRow(row.rowId)}>Remove</button>
          </div>
        ))}
      </div>
      {playerOptions.length === 0 ? (
        <p className="hint">Add players to the roster to record results.</p>
      ) : null}
      <div className="actions">
        <button type="button" onClick={onAddRow} disabled={!canAdd}>Add Player Result</button>
        <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Results'}</button>
        <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

export default PlayerStatsEditor

