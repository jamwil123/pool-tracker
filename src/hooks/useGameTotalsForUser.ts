import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, where, limit } from 'firebase/firestore'
import type { SeasonGameDocument, SeasonGamePlayerStat } from '../types/models'
import { db } from '../firebase/config'

export type GameUserTotals = {
  loading: boolean
  error: string | null
  totals: { wins: number; losses: number }
}

export const useGameTotalsForUser = (gameId: string, uid: string): GameUserTotals => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [game, setGame] = useState<SeasonGameDocument | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId || !uid) {
      setGame(null)
      setProfileId(null)
      setLoading(false)
      return
    }

    // Look up this user's profile auto-id (profiles now use auto-ids)
    const profilesRef = collection(db, 'userProfiles')
    const profileQuery = query(profilesRef, where('uid', '==', uid), limit(1))
    const unsubProfile = onSnapshot(
      profileQuery,
      (snap) => {
        if (!snap.empty) setProfileId(snap.docs[0].id)
        else setProfileId(null)
      },
      () => setProfileId(null),
    )
    const ref = doc(db, 'games', gameId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setGame(snap.exists() ? (snap.data() as SeasonGameDocument) : null)
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error('useGameTotalsForUser error', err)
        setError('Unable to load match data.')
        setLoading(false)
      },
    )
    return () => { unsub(); unsubProfile() }
  }, [gameId, uid])

  const totals = useMemo(() => {
    if (!game || !Array.isArray((game as any).playerStats)) return { wins: 0, losses: 0 }
    const stats = (game as any).playerStats as SeasonGamePlayerStat[]
    let wins = 0
    let losses = 0
    for (const s of stats) {
      if (s && (s.playerId === uid || (profileId && s.playerId === profileId))) {
        wins += (Number(s.singlesWins) || 0) + (Number(s.doublesWins) || 0)
        losses += (Number(s.singlesLosses) || 0) + (Number(s.doublesLosses) || 0)
      }
    }
    return { wins, losses }
  }, [game, uid, profileId])

  return { loading, error, totals }
}

export default useGameTotalsForUser
