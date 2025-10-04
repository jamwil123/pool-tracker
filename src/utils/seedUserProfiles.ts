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
  includeUnassigned?: boolean
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
  const includeUnassigned = options.includeUnassigned ?? true

  const usersSnap = await getDocs(collection(db, 'users'))
  const profilesSnap = await getDocs(collection(db, 'userProfiles'))

  const normalize = (s: unknown) =>
    (typeof s === 'string' ? s : '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')

  const nameToProfileId = new Map<string, string>()
  const uidToProfileId = new Map<string, string>()
  for (const p of profilesSnap.docs) {
    const data = p.data() as Partial<UserProfileDocument>
    const key = normalize(data.displayName)
    if (key && !nameToProfileId.has(key)) nameToProfileId.set(key, p.id)
    const uid = typeof (data as any).uid === 'string' ? (data as any).uid : null
    if (uid && !uidToProfileId.has(uid)) uidToProfileId.set(uid, p.id)
  }

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
    const rosterName = trimName(u.displayName, rosterId)
    const matchedByUid = assignedUid ? uidToProfileId.get(assignedUid) || null : null
    const matchedProfileId = matchedByUid || nameToProfileId.get(normalize(rosterName)) || null

    const hasAssigned = Boolean(assignedUid)
    if (!hasAssigned && !matchedProfileId && !includeUnassigned) {
      skipped++
      continue
    }

    // Determine target profile ref: existing match or a new auto-id doc
    let profileRef = matchedProfileId ? doc(db, 'userProfiles', matchedProfileId) : doc(collection(db, 'userProfiles'))
    const existing = matchedProfileId ? await getDoc(profileRef) : null
    const isNameIdPlaceholder = matchedProfileId ? matchedProfileId === rosterId : false
    let migratingToNew = false
    if (existing && existing.exists() && isNameIdPlaceholder) {
      // Migrate name-keyed placeholder to an auto-id doc
      profileRef = doc(collection(db, 'userProfiles'))
      migratingToNew = true
    }
    const shouldWriteFull = migratingToNew || !existing || !existing.exists() || overwrite

    const playerSnap = await getDoc(doc(db, 'players', rosterId))
    const player = playerSnap.exists() ? (playerSnap.data() as PlayerDocument) : null

    const displayName = rosterName
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
      if (shouldWriteFull) {
        const withUid = hasAssigned ? { ...profileDoc, uid: assignedUid } : { ...profileDoc, uid: null }
        batch.set(profileRef, withUid as any, { merge: true })
        ops++
        if (existing && existing.exists()) updates++
        else creates++
      } else {
        // Only update link fields on existing profile when not overwriting
        const minimal: Partial<UserProfileDocument> & { uid?: string | null } = {
          linkedRosterId: rosterId,
          linkedPlayerId: player ? rosterId : null,
          updatedAt: serverTimestamp(),
        }
        if (hasAssigned) minimal.uid = assignedUid
        batch.set(profileRef, minimal as any, { merge: true })
        ops++
        updates++
      }
      // If we migrated from an old placeholder doc id, delete it
      if (migratingToNew && matchedProfileId) {
        batch.delete(doc(db, 'userProfiles', matchedProfileId))
        ops++
      }
    }

    const linkTargetId = profileRef.id
    if (linkUp && !dryRun && linkTargetId) {
      const rosterRef = doc(db, 'users', rosterId)
      batch.set(
        rosterRef,
        {
          linkedProfileUid: linkTargetId,
          assignedUid: assignedUid || null,
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
          { linkedProfileUid: linkTargetId, updatedAt: serverTimestamp(), subsStatus: player?.subsStatus ?? 'due' },
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
