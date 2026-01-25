import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore'
import type { SeasonGameDocument, SeasonGamePlayerStat } from '../types/models'
import { db } from '../firebase/config'
import { classifyMatch } from '../utils/games'

export type MyPlayerMetrics = {
  loading: boolean
  error: string | null
  finishedMatches: number
  matchesPlayed: number
  selectionRatePct: number
  frameWins: number
  frameLosses: number
  frameWinRatePct: number
  framesWonPerMatch: number
  singlesWinRatePct: number
  doublesWinRatePct: number
  last5FrameWinRatePct: number
  contributionSharePct: number
}

export const useMyPlayerMetrics = (uid: string): MyPlayerMetrics => {
  const [loading, setLoading] = useState(true)
  const [_, setError] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [games, setGames] = useState<Array<{ id: string; data: SeasonGameDocument }>>([])

  useEffect(() => {
    if (!uid) {
      setProfileId(null)
      setGames([])
      setLoading(false)
      return
    }

    const profQ = query(collection(db, 'userProfiles'), where('uid', '==', uid), limit(1))
    const unsubProf = onSnapshot(
      profQ,
      (snap) => {
        setProfileId(!snap.empty ? snap.docs[0].id : null)
      },
      () => setProfileId(null),
    )
    const unsubGames = onSnapshot(
      collection(db, 'games'),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as SeasonGameDocument }))
        setGames(rows)
        setError(null)
        setLoading(false)
      },
      (e) => {
        console.error('useMyPlayerMetrics onSnapshot error', e)
        setError('Unable to compute metrics right now.')
        setLoading(false)
      },
    )
    return () => { unsubProf(); unsubGames() }
  }, [uid])

  const metrics = useMemo<MyPlayerMetrics>(() => {
    const isMe = (id: unknown) => {
      const s = typeof id === 'string' ? id : ''
      return Boolean(s && (s === uid || (profileId && s === profileId)))
    }
    const finished = games.filter((g) => classifyMatch({ matchDate: (g.data as any).matchDate, result: (g.data as any).result }) === 'previous')
    const finishedCount = finished.length

    let matchesPlayed = 0
    let frameWins = 0
    let frameLosses = 0
    let singlesW = 0
    let singlesL = 0
    let doublesW = 0
    let doublesL = 0
    let teamWinsCredits = 0

    // For last-5 trend, gather finished games by date
    const finishedSorted = [...finished].sort((a, b) => {
      const ad = (a.data as any).matchDate
      const bd = (b.data as any).matchDate
      const at = ad && 'toDate' in (ad as any) && typeof (ad as any).toDate === 'function' ? (ad as any).toDate().getTime() : 0
      const bt = bd && 'toDate' in (bd as any) && typeof (bd as any).toDate === 'function' ? (bd as any).toDate().getTime() : 0
      return at - bt
    })

    const last5 = finishedSorted.slice(-5)
    let last5W = 0
    let last5L = 0

    for (const g of finished) {
      const stats = (g.data as any).playerStats as SeasonGamePlayerStat[] | undefined
      if (Array.isArray(stats)) {
        let meWins = 0
        let meLoss = 0
        for (const s of stats) {
          // team totals for contribution share denominator
          teamWinsCredits += (Number(s.singlesWins || 0) + Number(s.doublesWins || 0))
          if (s && isMe(s.playerId)) {
            const sw = Number(s.singlesWins || 0)
            const sl = Number(s.singlesLosses || 0)
            const dw = Number(s.doublesWins || 0)
            const dl = Number(s.doublesLosses || 0)
            frameWins += sw + dw
            frameLosses += sl + dl
            singlesW += sw
            singlesL += sl
            doublesW += dw
            doublesL += dl
            meWins = sw + dw
            meLoss = sl + dl
          }
        }
        if (meWins + meLoss > 0) matchesPlayed += 1
      }
    }

    for (const g of last5) {
      const stats = (g.data as any).playerStats as SeasonGamePlayerStat[] | undefined
      if (!Array.isArray(stats)) continue
      for (const s of stats) {
        if (s && isMe(s.playerId)) {
          last5W += (Number(s.singlesWins || 0) + Number(s.doublesWins || 0))
          last5L += (Number(s.singlesLosses || 0) + Number(s.doublesLosses || 0))
        }
      }
    }

    const framesPlayed = frameWins + frameLosses
    const selectionRatePct = finishedCount ? (matchesPlayed / finishedCount) * 100 : 0
    const frameWinRatePct = framesPlayed ? (frameWins / framesPlayed) * 100 : 0
    const singlesPlayed = singlesW + singlesL
    const doublesPlayed = doublesW + doublesL
    const singlesWinRatePct = singlesPlayed ? (singlesW / singlesPlayed) * 100 : 0
    const doublesWinRatePct = doublesPlayed ? (doublesW / doublesPlayed) * 100 : 0
    const framesWonPerMatch = matchesPlayed ? frameWins / matchesPlayed : 0
    const last5Total = last5W + last5L
    const last5FrameWinRatePct = last5Total ? (last5W / last5Total) * 100 : 0
    const contributionSharePct = teamWinsCredits ? (frameWins / teamWinsCredits) * 100 : 0

    return {
      loading: false,
      error: null,
      finishedMatches: finishedCount,
      matchesPlayed,
      selectionRatePct,
      frameWins,
      frameLosses,
      frameWinRatePct,
      framesWonPerMatch,
      singlesWinRatePct,
      doublesWinRatePct,
      last5FrameWinRatePct,
      contributionSharePct,
    }
  }, [games, uid, profileId])

  return loading ? {
    loading: true,
    error: null,
    finishedMatches: 0,
    matchesPlayed: 0,
    selectionRatePct: 0,
    frameWins: 0,
    frameLosses: 0,
    frameWinRatePct: 0,
    framesWonPerMatch: 0,
    singlesWinRatePct: 0,
    doublesWinRatePct: 0,
    last5FrameWinRatePct: 0,
    contributionSharePct: 0,
  } : metrics
}

export default useMyPlayerMetrics
