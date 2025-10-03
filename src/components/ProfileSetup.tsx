import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import type { PlayerDocument, Role, RosterDocument, UserProfileDocument } from '../types/models'

type RosterEntry = RosterDocument & { id: string }

type PlayerEntry = PlayerDocument & { id: string }

type ProfileSetupState = {
  roster: RosterEntry[]
  selectedId: string
  error: string | null
  loading: boolean
  submitting: boolean
}

const defaultState: ProfileSetupState = {
  roster: [],
  selectedId: '',
  error: null,
  loading: true,
  submitting: false,
}

const ensureRole = (role?: Role | string | null): Role => {
  if (role === 'captain' || role === 'viceCaptain' || role === 'player') {
    return role
  }
  return 'player'
}

const normaliseDisplayName = (value: string, fallback: string) => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

const createProfileDocument = (
  entry: RosterEntry,
  player: PlayerEntry | null,
): UserProfileDocument => ({
  displayName: entry.displayName,
  role: entry.role,
  linkedRosterId: entry.id,
  linkedPlayerId: player ? player.id : null,
  totalWins: player?.wins ?? 0,
  totalLosses: player?.losses ?? 0,
  subsStatus: player?.subsStatus === 'paid' ? 'paid' : 'due',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

const ProfileSetup = () => {
  const { user, signOut } = useAuth()
  const [state, setState] = useState<ProfileSetupState>(defaultState)

  useEffect(() => {
    const rosterRef = collection(db, 'users')

    const unsubscribe = onSnapshot(
      rosterRef,
      (snapshot) => {
        const entries: RosterEntry[] = snapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data() as Partial<RosterDocument>
            return {
              id: docSnapshot.id,
              displayName: normaliseDisplayName(data?.displayName ?? '', docSnapshot.id),
              role: ensureRole(data?.role ?? null),
              assignedUid: data?.assignedUid ?? null,
              assignedEmail: data?.assignedEmail ?? null,
              assignedAt: data?.assignedAt ?? null,
              createdAt: data?.createdAt ?? null,
              linkedProfileUid: data?.linkedProfileUid ?? null,
            }
          })
          .sort((a, b) => a.displayName.localeCompare(b.displayName))

        setState((prev) => ({
          ...prev,
          roster: entries,
          loading: false,
          error: null,
        }))
      },
      (snapshotError) => {
        console.error('Failed to load roster', snapshotError)
        setState((prev) => ({
          ...prev,
          error: 'Unable to load the player roster right now.',
          loading: false,
        }))
      },
    )

    return () => unsubscribe()
  }, [])

  const availableRoster = useMemo(() => {
    if (!user) return []
    return state.roster.filter((entry) => !entry.assignedUid || entry.assignedUid === user.uid)
  }, [state.roster, user])

  if (!user) {
    return null
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const selectedRosterId = state.selectedId

    if (!selectedRosterId) {
      setState((prev) => ({ ...prev, error: 'Pick your name from the list to continue.' }))
      return
    }

    setState((prev) => ({ ...prev, error: null, submitting: true }))

    try {
      const rosterRef = doc(db, 'users', selectedRosterId)
      const profileRef = doc(db, 'userProfiles', user.uid)
      const playerRef = doc(db, 'players', selectedRosterId)

      await runTransaction(db, async (transaction) => {
        const rosterSnapshot = await transaction.get(rosterRef)
        if (!rosterSnapshot.exists()) {
          throw new Error('Roster entry not found')
        }

        const rosterData = rosterSnapshot.data() as Partial<RosterDocument>
        const entry: RosterEntry = {
          id: rosterSnapshot.id,
          displayName: normaliseDisplayName(rosterData?.displayName ?? '', rosterSnapshot.id),
          role: ensureRole(rosterData?.role ?? null),
          assignedUid: rosterData?.assignedUid ?? null,
          assignedEmail: rosterData?.assignedEmail ?? null,
          assignedAt: rosterData?.assignedAt ?? null,
          createdAt: rosterData?.createdAt ?? null,
          linkedProfileUid: rosterData?.linkedProfileUid ?? null,
        }

        const playerSnapshot = await transaction.get(playerRef)
        const playerEntry: PlayerEntry | null = playerSnapshot.exists()
          ? {
              id: playerSnapshot.id,
              ...(playerSnapshot.data() as PlayerDocument),
            }
          : null

        if (entry.assignedUid && entry.assignedUid !== user.uid) {
          throw new Error('That player is already linked to another account.')
        }

        transaction.set(profileRef, createProfileDocument(entry, playerEntry))

        transaction.update(rosterRef, {
          assignedUid: user.uid,
          assignedEmail: user.email ?? null,
          assignedAt: serverTimestamp(),
          linkedProfileUid: user.uid,
        })

        if (playerEntry) {
          transaction.update(playerRef, {
            linkedProfileUid: user.uid,
            updatedAt: serverTimestamp(),
            subsStatus: playerEntry.subsStatus ?? 'due',
          })
        }
      })

      setState((prev) => ({ ...prev, selectedId: '' }))
    } catch (assignError) {
      console.error('Failed to assign roster entry', assignError)
      setState((prev) => ({
        ...prev,
        error:
          assignError instanceof Error
            ? assignError.message
            : 'Unable to complete setup. Try again later.',
      }))
    } finally {
      setState((prev) => ({ ...prev, submitting: false }))
    }
  }

  return (
    <main className="container">
      <section className="panel">
        <header>
          <h2>Set Up Your Profile</h2>
          <p>
            Welcome! Pick your name from the roster so we can link this login to your season data.
          </p>
        </header>
        <article className="card">
          <h3>Select Your Name</h3>
          {state.loading ? <p>Loading roster…</p> : null}
          {state.error ? <p className="error">{state.error}</p> : null}
          {!state.loading && availableRoster.length === 0 ? (
            <p>
              We could not find an available entry for you. Ask the captain to add you to the `users`
              collection or tap cancel below.
            </p>
          ) : null}
          <form onSubmit={handleSubmit}>
            <label htmlFor="player-select">Your Name</label>
            <select
              id="player-select"
              value={state.selectedId}
              onChange={(event) =>
                setState((prev) => ({ ...prev, selectedId: event.target.value, error: null }))
              }
              disabled={availableRoster.length === 0 || state.submitting}
            >
              <option value="">— Pick your name —</option>
              {availableRoster.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName} ({entry.role})
                </option>
              ))}
            </select>
            <div className="actions">
              <button type="submit" disabled={state.submitting || availableRoster.length === 0}>
                {state.submitting ? 'Linking…' : 'Link Account'}
              </button>
              <button type="button" onClick={signOut}>
                Cancel
              </button>
            </div>
          </form>
        </article>
      </section>
    </main>
  )
}

export default ProfileSetup
