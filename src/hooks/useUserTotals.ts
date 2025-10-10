import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore'
import type { SeasonGameDocument, SeasonGamePlayerStat } from '../types/models'
import { db } from '../firebase/config'

export type DueGame = { id: string; opponent: string; matchDate: Date | null }

export type NextGame = { id: string; opponent: string; matchDate: Date | null; location: string; homeOrAway: 'home' | 'away' }

export type UserTotals = {
  loading: boolean
  error: string | null
  totals: { wins: number; losses: number }
  singles: { wins: number; losses: number }
  gamesCount: number
  subsDueCount: number
  subsDueGames: DueGame[]
  nextGame: NextGame | null
}

// removed unused helper

export const useUserTotals = (uid: string): UserTotals => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<Array<{ id: string; data: SeasonGameDocument }>>([])
  const [profileId, setProfileId] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) {
      setSnapshots([])
      setProfileId(null)
      setLoading(false)
      return
    }

    // Subscribe to this user's profile doc to get their profileId (profiles use auto-ids)
    const profilesRef = collection(db, 'userProfiles')
    const profileQuery = query(profilesRef, where('uid', '==', uid), limit(1))
    const unsubProfile = onSnapshot(
      profileQuery,
      (snap) => {
        if (!snap.empty) setProfileId(snap.docs[0].id)
        else setProfileId(null)
      },
      (err) => {
        console.error('useUserTotals profile lookup error', err)
        setProfileId(null)
      },
    )

    // Subscribe to all games; compute membership client-side against stats.playerId
    const gamesRef = collection(db, 'games')
    const unsubGames = onSnapshot(
      gamesRef,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as SeasonGameDocument }))
        setSnapshots(rows)
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error('useUserTotals onSnapshot error', err)
        setError('Unable to load totals for this user.')
        setLoading(false)
      },
    )

    return () => {
      unsubProfile()
      unsubGames()
    }
  }, [uid])

  const { totals, singles, gamesCount, subsDueCount, subsDueGames, nextGame } = useMemo(() => {
    const isMe = (id: unknown) => {
      const s = typeof id === 'string' ? id : ''
      return Boolean(s && (s === uid || (profileId && s === profileId)))
    }
    let wins = 0
    let losses = 0
    let singlesWins = 0
    let singlesLosses = 0
    let count = 0
    let due = 0
    const dueGames: DueGame[] = []
    let bestNext: NextGame | null = null
    let bestTs: number | null = null
    for (const g of snapshots) {
      const stats = (g.data as any).playerStats as SeasonGamePlayerStat[] | undefined
      const partial = (() => {
        if (!Array.isArray(stats)) return { wins: 0, losses: 0 }
        let w = 0
        let l = 0
        for (const s of stats) {
          if (s && isMe(s.playerId)) {
            w += (Number(s.singlesWins) || 0) + (Number(s.doublesWins) || 0)
            l += (Number(s.singlesLosses) || 0) + (Number(s.doublesLosses) || 0)
            singlesWins += Number(s.singlesWins) || 0
            singlesLosses += Number(s.singlesLosses) || 0
          }
        }
        return { wins: w, losses: l }
      })()
      if (Array.isArray(stats)) {
        const entry = stats.find((s) => s && isMe(s.playerId))
        if (entry && !Boolean((entry as any).subsPaid)) {
          due += 1
          const matchDateVal = g.data.matchDate && 'toDate' in g.data.matchDate && typeof (g.data.matchDate as any).toDate === 'function'
            ? (g.data.matchDate as any).toDate()
            : null
          dueGames.push({ id: g.id, opponent: g.data.opponent || 'TBC', matchDate: matchDateVal })
        }
      }
      wins += partial.wins
      losses += partial.losses
      count += 1

      // Determine next upcoming match (nearest future date, regardless of assignment)
      const hasDate = g.data.matchDate && 'toDate' in g.data.matchDate && typeof (g.data.matchDate as any).toDate === 'function'
      const date = hasDate ? (g.data.matchDate as any).toDate() as Date : null
      if (date) {
        const ts = date.getTime()
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const isTodayOrFuture = ts >= todayStart.getTime()
        if (isTodayOrFuture) {
          if (bestTs === null || ts < bestTs) {
            bestTs = ts
            bestNext = {
              id: g.id,
              opponent: g.data.opponent || 'TBC',
              matchDate: date,
              location: (g.data as any).location || '',
              homeOrAway: (g.data as any).homeOrAway === 'away' ? 'away' : 'home',
            }
          }
        }
      }
    }
    return { totals: { wins, losses }, singles: { wins: singlesWins, losses: singlesLosses }, gamesCount: count, subsDueCount: due, subsDueGames: dueGames, nextGame: bestNext }
  }, [snapshots, uid, profileId])

  return { loading, error, totals, singles, gamesCount, subsDueCount, subsDueGames, nextGame }
}

export default useUserTotals
