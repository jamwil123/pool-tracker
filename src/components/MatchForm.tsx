import React from 'react'

type MatchFormState = {
  opponent: string
  matchDate: string
  location: string
  homeOrAway: 'home' | 'away'
}

type Props = {
  formState: MatchFormState
  onChange: (field: keyof MatchFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  submitting: boolean
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

const MatchForm = ({ formState, onChange, submitting, onSubmit, onCancel }: Props) => {
  return (
    <form onSubmit={onSubmit}>
      <h3>Add Match</h3>
      <label htmlFor="opponent">Team Name</label>
      <input
        id="opponent"
        type="text"
        value={formState.opponent}
        onChange={onChange('opponent')}
        required
      />

      <label htmlFor="matchDate">Match Date</label>
      <input
        id="matchDate"
        type="date"
        value={formState.matchDate}
        onChange={onChange('matchDate')}
        required
      />

      <label htmlFor="location">Location</label>
      <input
        id="location"
        type="text"
        value={formState.location}
        onChange={onChange('location')}
        placeholder="Club venue"
        required
      />

      <label htmlFor="homeOrAway">Home or Away</label>
      <select
        id="homeOrAway"
        value={formState.homeOrAway}
        onChange={onChange('homeOrAway')}
      >
        <option value="home">Home</option>
        <option value="away">Away</option>
      </select>

      <div className="actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Match'}
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export default MatchForm

