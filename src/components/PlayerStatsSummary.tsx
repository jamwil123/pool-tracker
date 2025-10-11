// No Chakra imports needed; uses existing classes
import type { SeasonGamePlayerStat } from '../types/models'

type Props = {
  stats: SeasonGamePlayerStat[]
  canManage: boolean
  myUid?: string
  myProfileId?: string | null
}

const PlayerStatsSummary = ({ stats, canManage, myUid, myProfileId }: Props) => {
  if (!Array.isArray(stats) || stats.length === 0) {
    return <p className="hint" id="player-results-panel">No player results yet.</p>
  }
  return (
    <div id="player-results-panel" className="player-stats-summary">
      {stats.map((s) => (
        (canManage || s.playerId === myUid || (myProfileId && s.playerId === myProfileId)) ? (
          <div key={s.playerId} className="player-stat-chip">
            <strong>{s.displayName}</strong>
            <span>Singles W/L {s.singlesWins}:{s.singlesLosses}</span>
            <span>Doubles W/L {s.doublesWins}:{s.doublesLosses}</span>
            <span className={`tag ${s.subsPaid ? 'subs-paid' : 'subs-due'}`}>Subs {s.subsPaid ? 'Paid' : 'Due'}</span>
          </div>
        ) : null
      ))}
    </div>
  )
}

export default PlayerStatsSummary
