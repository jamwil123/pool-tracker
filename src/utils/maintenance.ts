import { collection, doc, getDocs, runTransaction, Timestamp, updateDoc } from 'firebase/firestore'
import type { SeasonGameDocument, SeasonGamePlayerStat } from '../types/models'
import { db } from '../firebase/config'

// One-time helper to backfill `playerIds` on each game from `playerStats`.
// Run from a privileged client (captain/vice) or an admin tool.
export const backfillPlayerIds = async (): Promise<number> => {
  const gamesSnap = await getDocs(collection(db, 'games'))
  let updated = 0
  for (const d of gamesSnap.docs) {
    const data = d.data() as Partial<SeasonGameDocument>
    const stats = (data as any).playerStats as SeasonGamePlayerStat[] | undefined
    const ids = Array.isArray(stats) ? Array.from(new Set(stats.map((s) => s.playerId).filter(Boolean))) : []
    // Skip if up-to-date
    if (Array.isArray((data as any).playerIds) && (data as any).playerIds.length === ids.length) continue
    await runTransaction(db, async (tx) => {
      tx.update(doc(db, 'games', d.id), { playerIds: ids })
    })
    updated += 1
  }
  return updated
}

export default backfillPlayerIds

// Backfill matchDate from notes (YYYY-MM-DD) at 20:00 local
export const backfillMatchDatesFromNotes = async (): Promise<number> => {
  const gamesSnap = await getDocs(collection(db, 'games'))
  let updated = 0
  for (const d of gamesSnap.docs) {
    const data = d.data() as any
    if (data.matchDate) continue
    const notes = typeof data.notes === 'string' ? data.notes.trim() : ''
    if (!notes) continue
    const parsed = new Date(notes)
    if (Number.isNaN(parsed.getTime())) continue
    const at20 = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 20, 0, 0, 0)
    try {
      await updateDoc(doc(db, 'games', d.id), { matchDate: Timestamp.fromDate(at20) })
      updated += 1
    } catch (e) {
      // ignore and continue
      console.warn('Failed backfilling matchDate for', d.id, e)
    }
  }
  return updated
}
