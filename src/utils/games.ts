import { Timestamp } from 'firebase/firestore'

export type MatchFilter = 'upcoming' | 'previous'

export const toMillis = (matchDate: any): number | null =>
  matchDate instanceof Timestamp ? matchDate.toMillis() : matchDate instanceof Date ? matchDate.getTime() : null

// Keep pending games in Upcoming through the entire match day; otherwise decided games are Previous
export const classifyMatch = (game: { matchDate?: any; result?: string | null }): MatchFilter => {
  const result = game.result
  if (result === 'win' || result === 'loss') return 'previous'

  const dt = game.matchDate instanceof Timestamp ? game.matchDate.toDate() : game.matchDate instanceof Date ? game.matchDate : null
  if (!dt) return 'upcoming'

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  return dt.getTime() < startOfToday.getTime() ? 'previous' : 'upcoming'
}

export const sortByUpcoming = <T extends { matchDate?: any }>(rows: T[]): T[] => {
  const list = [...rows]
  list.sort((a, b) => {
    const ta = toMillis(a.matchDate)
    const tb = toMillis(b.matchDate)
    if (ta === null && tb === null) return 0
    if (ta === null) return 1
    if (tb === null) return -1
    return ta - tb
  })
  return list
}

export const sortByPrevious = <T extends { matchDate?: any; updatedAt?: any }>(rows: T[]): T[] => {
  const list = [...rows]
  list.sort((a, b) => {
    const ta = toMillis(a.matchDate)
    const tb = toMillis(b.matchDate)
    if (ta !== null && tb !== null) return tb - ta
    if (ta === null && tb !== null) return 1
    if (ta !== null && tb === null) return -1
    const ua = toMillis((a as any).updatedAt)
    const ub = toMillis((b as any).updatedAt)
    return (ub ?? 0) - (ua ?? 0)
  })
  return list
}

export default classifyMatch

