import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import type { Role, RosterDocument, PlayerDocument, UserProfileDocument } from '../types/models'
import { db } from '../firebase/config'

export type SeedOptions = {
  overwrite?: boolean
  linkUp?: boolean
  dryRun?: boolean
}

export type SeedResult = {
  creates: number
  updates: number
  skipped: number
  linked: number
}

const ensureRole = (role?: Role | string | null): Role => {
  if (role === 'captain' || role === 'viceCaptain' || role === 'player') return role
  return 'player'
}

const trimName = (name: unknown, fallback: string): string => {
  if (typeof name === 'string') {
    const t = name.trim()
    if (t.length) return t
  }
  return fallback
}

export const seedUserProfiles = async (options: SeedOptions = {}): Promise<SeedResult> => {
  const overwrite = options.overwrite ?? false
  const linkUp = options.linkUp ?? true
  const dryRun = options.dryRun ?? false

  const usersSnap = await getDocs(collection(db, 'users'))

  let creates = 0
  let updates = 0
  let skipped = 0
  let linked = 0

  let batch = writeBatch(db)
  let ops = 0

  for (const docSnap of usersSnap.docs) {
    const rosterId = docSnap.id
    const u = (docSnap.data() as Partial<RosterDocument>) || {}
    const assignedUid = typeof u.assignedUid === 'string' ? u.assignedUid.trim() : ''

    if (!assignedUid) {
      skipped++
      continue
    }

    const profileRef = doc(db, 'userProfiles', assignedUid)
    const existing = await getDoc(profileRef)

    if (existing.exists() && !overwrite) {
      skipped++
      continue
    }

    const playerSnap = await getDoc(doc(db, 'players', rosterId))
    const player = playerSnap.exists() ? (playerSnap.data() as PlayerDocument) : null

    const displayName = trimName(u.displayName, rosterId)
    const role = ensureRole(u.role as Role)
    const totalWins = player?.wins ?? 0
    const totalLosses = player?.losses ?? 0
    const subsStatus = player?.subsStatus === 'paid' ? 'paid' : 'due'

    const profileDoc: UserProfileDocument = {
      displayName,
      role,
      linkedRosterId: rosterId,
      linkedPlayerId: player ? rosterId : null,
      totalWins,
      totalLosses,
      subsStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    if (!dryRun) {
      batch.set(profileRef, profileDoc, { merge: true })
      ops++
      if (existing.exists()) updates++
      else creates++
    }

    if (linkUp && !dryRun) {
      const rosterRef = doc(db, 'users', rosterId)
      batch.set(
        rosterRef,
        {
          linkedProfileUid: assignedUid,
          assignedUid,
          assignedEmail: (u as any).assignedEmail ?? null,
          assignedAt: (u as any).assignedAt ?? serverTimestamp(),
        },
        { merge: true },
      )
      ops++

      if (playerSnap.exists()) {
        const playerRef = doc(db, 'players', rosterId)
        batch.set(
          playerRef,
          { linkedProfileUid: assignedUid, updatedAt: serverTimestamp(), subsStatus: player?.subsStatus ?? 'due' },
          { merge: true },
        )
        ops++
      }
      linked++
    }

    if (ops >= 400 && !dryRun) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }

  if (!dryRun && ops > 0) {
    await batch.commit()
  }

  return { creates, updates, skipped, linked }
}

export default seedUserProfiles

