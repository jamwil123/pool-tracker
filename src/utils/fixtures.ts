import { Timestamp } from 'firebase/firestore'
import type { SeasonGameDocument } from '../types/models'

export type RawImportGame = Partial<SeasonGameDocument> & {
  opponent?: string
  location?: string
  homeOrAway?: 'home' | 'away' | string
  matchDate?: string | null
  notes?: string | null
}

export const parseYyyyMmDdToTimestamp20 = (s: string | null | undefined) => {
  if (!s || typeof s !== 'string') return null as any
  const t = s.trim()
  if (!t) return null as any
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null as any
  const at20 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0, 0, 0)
  return Timestamp.fromDate(at20)
}

export const normalizeImportGame = (
  row: RawImportGame,
): Omit<SeasonGameDocument, 'createdAt' | 'updatedAt'> => {
  const opponent = typeof row.opponent === 'string' ? row.opponent.trim() : 'TBC'
  const location = typeof row.location === 'string' ? row.location.trim() : ''
  const homeOrAway = row.homeOrAway === 'away' ? 'away' : 'home'
  const notes = typeof row.notes === 'string' && row.notes.trim().length ? row.notes.trim() : null
  const players = Array.isArray(row.players) ? row.players : []
  const playerStats = Array.isArray(row.playerStats) ? row.playerStats : []
  const result = row.result === 'win' || row.result === 'loss' ? row.result : 'pending'
  const matchDate = row.matchDate ? parseYyyyMmDdToTimestamp20(row.matchDate as any) : parseYyyyMmDdToTimestamp20(notes as any)
  return { opponent, matchDate, location, homeOrAway, players, playerStats, result, notes }
}

export const buildStableMatchId = (g: Omit<SeasonGameDocument, 'createdAt' | 'updatedAt'>) => {
  const dateLabel = g.notes || (g.matchDate ? g.matchDate.toDate().toISOString().slice(0, 10) : 'tbc')
  const opp = String(g.opponent || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `match-${dateLabel}-${g.homeOrAway}-${opp}`
}

export default normalizeImportGame

