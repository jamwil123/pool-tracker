import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, increment } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { SeasonGameDocument, SeasonGamePlayerStat } from '../types/models'
import { buildStableMatchId, normalizeImportGame } from '../utils/fixtures'

export type UpdateResultOutcome = { ok: true } | { ok: false; error: string }

const useSeasonActions = () => {
  const updateResult = async (gameId: string, result: 'win' | 'loss', games: Array<{ id: string; result?: string | null }>): Promise<UpdateResultOutcome> => {
    try {
      const current = games.find((g) => g.id === gameId)
      if (!current) return { ok: false, error: 'Match not found' }
      if (current.result === 'pending') {
        const decidedSnap = await getDocs(query(collection(db, 'games'), where('result', 'in', ['win', 'loss'])))
        if (decidedSnap.size >= 13) {
          return { ok: false, error: 'Season cap reached: 13 results already recorded.' }
        }
      }
      await updateDoc(doc(db, 'games', gameId), { result, updatedAt: serverTimestamp() })
      return { ok: true }
    } catch (e) {
      console.error('Failed to update match result', e)
      return { ok: false, error: 'Could not update the match result.' }
    }
  }

  const importFixtures = async (jsonText: string) => {
    try {
      const data = JSON.parse(jsonText) as any[]
      if (!Array.isArray(data)) return { ok: false as const, error: 'Input must be a JSON array' }
      let created = 0, skipped = 0, updated = 0
      for (const row of data) {
        const g = normalizeImportGame(row)
        const id = buildStableMatchId(g)
        const ref = doc(db, 'games', id)
        const snap = await getDoc(ref)
        if (snap.exists()) { skipped++; continue }
        await setDoc(ref, { ...g, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        created++
      }
      return { ok: true as const, created, skipped, updated }
    } catch (e: any) {
      console.error('Import failed', e)
      return { ok: false as const, error: e?.message || 'Import failed' }
    }
  }

  const savePlayerStats = async (
    gameId: string,
    rows: Array<{ rowId: string; playerId: string; singlesWins: number; singlesLosses: number; doublesWins: number; doublesLosses: number; subsPaid?: boolean }>,
    playerOptions: Array<{ id: string; displayName: string }>,
  ) => {
    if (!playerOptions || playerOptions.length === 0) return { ok: false as const, error: 'No players available. Add players to the roster first.' }

    const stats: SeasonGamePlayerStat[] = rows
      .filter((r) => r.playerId)
      .map((r) => {
        const opt = playerOptions.find((p) => p.id === r.playerId)
        return {
          playerId: r.playerId,
          displayName: opt?.displayName ?? r.playerId,
          singlesWins: Number(r.singlesWins) || 0,
          singlesLosses: Number(r.singlesLosses) || 0,
          doublesWins: Number(r.doublesWins) || 0,
          doublesLosses: Number(r.doublesLosses) || 0,
          subsPaid: Boolean((r as any).subsPaid) || false,
        }
      })

    try {
      await runTransaction(db, async (transaction) => {
        const gameRef = doc(db, 'games', gameId)
        const gameSnapshot = await transaction.get(gameRef)
        if (!gameSnapshot.exists()) throw new Error('Match not found')

        const gameData = gameSnapshot.data() as SeasonGameDocument
        const previousStats = Array.isArray((gameData as any).playerStats) ? (gameData as any).playerStats as SeasonGamePlayerStat[] : []

        const previousMap = new Map(previousStats.map((s) => [s.playerId, s]))
        const nextMap = new Map(stats.map((s) => [s.playerId, s]))
        const all = new Set<string>([...previousMap.keys(), ...nextMap.keys()])

        for (const pid of all) {
          const pPrev = previousMap.get(pid)
          const pNext = nextMap.get(pid)
          const prevWins = (pPrev?.singlesWins ?? 0) + (pPrev?.doublesWins ?? 0)
          const prevLoss = (pPrev?.singlesLosses ?? 0) + (pPrev?.doublesLosses ?? 0)
          const nextWins = (pNext?.singlesWins ?? 0) + (pNext?.doublesWins ?? 0)
          const nextLoss = (pNext?.singlesLosses ?? 0) + (pNext?.doublesLosses ?? 0)
          const winDiff = nextWins - prevWins
          const lossDiff = nextLoss - prevLoss
          if (winDiff === 0 && lossDiff === 0) continue

          const profRef = doc(db, 'userProfiles', pid)
          const profUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() }
          if (winDiff !== 0) (profUpdates as any).totalWins = increment(winDiff)
          if (lossDiff !== 0) (profUpdates as any).totalLosses = increment(lossDiff)
          transaction.set(profRef, profUpdates, { merge: true })
        }

        transaction.update(gameRef, {
          playerStats: stats,
          players: stats.map((s) => s.displayName),
          playerIds: Array.from(new Set(stats.map((s) => s.playerId))),
          updatedAt: serverTimestamp(),
        })
      })
      return { ok: true as const }
    } catch (e: any) {
      console.error('Failed to save player stats', e)
      return { ok: false as const, error: e?.message || 'Unable to save player results right now.' }
    }
  }

  return { updateResult, importFixtures, savePlayerStats }
}

export default useSeasonActions
