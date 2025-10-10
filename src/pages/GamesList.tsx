import { useEffect, useMemo, useState } from 'react'
import { Timestamp, addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, getDocs, where, deleteDoc } from 'firebase/firestore'
import type { ChangeEvent, FormEvent } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { isManagerRole } from '../types/models'
import type { SeasonGameDocument } from '../types/models'
import { Box, Heading, Text, HStack, Button, SimpleGrid, Input } from '@chakra-ui/react'
import { TEAM_NAME } from '../config/app'

type SeasonGame = SeasonGameDocument & { id: string }
type MatchFilter = 'upcoming' | 'previous'
type MatchFormState = { opponent: string; matchDate: string; location: string; homeOrAway: 'home' | 'away' }

const defaultFormState: MatchFormState = { opponent: '', matchDate: '', location: '', homeOrAway: 'home' }

const classify = (game: SeasonGame): MatchFilter => {
  // If a result has been recorded, treat as previous
  if (game.result === 'win' || game.result === 'loss') return 'previous'

  // Pending results: keep in Upcoming through the entire match day
  const dt = game.matchDate instanceof Timestamp ? game.matchDate.toDate() : null
  if (!dt) return 'upcoming'

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  // If the date is before today, it's previous; otherwise it's upcoming (today or future)
  return dt.getTime() < startOfToday.getTime() ? 'previous' : 'upcoming'
}

const GamesList = () => {
  const { profile } = useAuth()
  const [games, setGames] = useState<SeasonGame[]>([])
  const [filter, setFilter] = useState<MatchFilter>('upcoming')
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formState, setFormState] = useState<MatchFormState>(defaultFormState)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingState, setEditingState] = useState<MatchFormState>(defaultFormState)
  const [editingNotes, setEditingNotes] = useState<string>('')
  const [editingSaving, setEditingSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  

  const canManage = useMemo(() => !!profile && isManagerRole(profile.role), [profile])

  useEffect(() => {
    const q = query(collection(db, 'games'), orderBy('matchDate', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      const rows: SeasonGame[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as SeasonGameDocument) }))
      setGames(rows)
      setError(null)
    }, (e) => {
      console.error(e)
      setError('Unable to load matches right now.')
    })
    return () => unsub()
  }, [])

  const upcoming = games.filter((g) => classify(g) === 'upcoming')
  const previous = games.filter((g) => classify(g) === 'previous')
  const visible = filter === 'upcoming' ? upcoming : previous

  const onChange = (field: keyof MatchFormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormState((s) => ({ ...s, [field]: field === 'homeOrAway' ? (e.target.value as 'home' | 'away') : e.target.value }))

  const reset = () => { setFormState(defaultFormState); setShowForm(false) }

  const toDateInput = (d: Timestamp | null | undefined) => {
    if (!d) return ''
    const dt = d.toDate()
    const yyyy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const openEdit = (g: SeasonGame) => {
    setEditingId(g.id)
    setEditingState({
      opponent: g.opponent || '',
      matchDate: toDateInput(g.matchDate),
      location: g.location || '',
      homeOrAway: g.homeOrAway === 'away' ? 'away' : 'home',
    })
    setEditingNotes((g as any).notes || '')
  }

  const formatDateLabel = (g: SeasonGame): string => {
    if (g.matchDate instanceof Timestamp) return g.matchDate.toDate().toLocaleDateString()
    const n = (g as any).notes as string | null | undefined
    if (typeof n === 'string' && n.trim()) {
      // Try to parse YYYY-MM-DD in notes
      const d = new Date(n.trim())
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString()
      return n.trim()
    }
    return 'Date TBC'
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingSaving(false)
    setEditingState(defaultFormState)
    setEditingNotes('')
  }

  const saveEdit = async (e: FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault()
    if (!canManage) return
    setEditingSaving(true)
    setError(null)
    try {
      const payload: any = {
        opponent: editingState.opponent.trim(),
        matchDate: editingState.matchDate ? Timestamp.fromDate(new Date(editingState.matchDate)) : null,
        location: editingState.location.trim(),
        homeOrAway: editingState.homeOrAway,
        notes: editingNotes.trim() || null,
        updatedAt: serverTimestamp(),
      }
      await updateDoc(doc(db, 'games', id), payload)
      cancelEdit()
    } catch (err) {
      console.error(err)
      setError('Unable to save match changes.')
    } finally {
      setEditingSaving(false)
    }
  }

  const deleteMatch = async (id: string) => {
    if (!canManage) return
    const g = games.find((x) => x.id === id)
    const label = g ? `${g.opponent} (${formatDateLabel(g)})` : id
    const ok = window.confirm(`Delete match ${label}? This cannot be undone.`)
    if (!ok) return
    setDeletingId(id)
    setError(null)
    try {
      await deleteDoc(doc(db, 'games', id))
      if (editingId === id) cancelEdit()
    } catch (err) {
      console.error(err)
      setError('Unable to delete this match. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canManage) return
    setSubmitting(true)
    setError(null)
    try {
      await addDoc(collection(db, 'games'), {
        opponent: formState.opponent.trim(),
        matchDate: formState.matchDate ? Timestamp.fromDate(new Date(formState.matchDate)) : null,
        location: formState.location.trim(),
        homeOrAway: formState.homeOrAway,
        players: [],
        playerStats: [],
        notes: null,
        result: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      reset()
    } catch (err) {
      console.error(err)
      setError('Unable to add the match. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const setResult = async (id: string, result: 'win' | 'loss') => {
    if (!canManage) return
    try {
      const current = games.find((g) => g.id === id)
      if (!current) throw new Error('Match not found')
      if (current.result === 'pending') {
        const decidedSnap = await getDocs(query(collection(db, 'games'), where('result', 'in', ['win', 'loss'])))
        if (decidedSnap.size >= 13) {
          setError('Season cap reached: 13 results already recorded.')
          return
        }
      }
      await updateDoc(doc(db, 'games', id), { result, updatedAt: serverTimestamp() })
    } catch (e) {
      console.error(e)
      setError('Could not update match result.')
    }
  }

  

  return (
    <Box>
      <Box as="header" mb={4}>
        <Heading size="lg">Season Matches</Heading>
        <Text color="gray.600">{TEAM_NAME}</Text>
        <Text color="gray.600">
          {profile?.displayName ? (
            <>Welcome, {profile.displayName}. </>
          ) : null}
          Browse fixtures and open a match to manage results.
        </Text>
      </Box>
      <HStack justify="space-between" mb={3} style={{ flexWrap: 'wrap' }} gap={2}>
        <HStack gap={2}>
          <Button
            size="sm"
            variant={filter === 'upcoming' ? 'solid' : 'outline'}
            colorScheme={filter === 'upcoming' ? 'blue' : 'gray'}
            aria-pressed={filter === 'upcoming'}
            onClick={() => setFilter('upcoming')}
            _active={{ boxShadow: '0 0 0 2px rgba(59,130,246,.45)' }}
            _focus={{ boxShadow: '0 0 0 3px rgba(59,130,246,.35)' }}
          >
            Upcoming ({upcoming.length})
          </Button>
          <Button
            size="sm"
            variant={filter === 'previous' ? 'solid' : 'outline'}
            colorScheme={filter === 'previous' ? 'blue' : 'gray'}
            aria-pressed={filter === 'previous'}
            onClick={() => setFilter('previous')}
            _active={{ boxShadow: '0 0 0 2px rgba(59,130,246,.45)' }}
            _focus={{ boxShadow: '0 0 0 3px rgba(59,130,246,.35)' }}
          >
            Previous ({previous.length})
          </Button>
        </HStack>
        {canManage ? (
          <Button onClick={() => setShowForm((v) => !v)} colorScheme="blue">{showForm ? 'Close New Match' : 'Add New Match'}</Button>
        ) : null}
      </HStack>
      {error ? <Box className="error" mb={3}>{error}</Box> : null}
      {canManage && showForm ? (
        <Box borderWidth="1px" borderRadius="lg" p={4} bg="white" mb={4}>
          <form onSubmit={create}>
          <Heading as="h3" size="sm" mb={3}>Add Match</Heading>
          <Text fontSize="sm" mb={1}>Team Name</Text>
          <Input id="opponent" value={formState.opponent} onChange={onChange('opponent')} required />
          <Text fontSize="sm" mt={3} mb={1}>Match Date</Text>
          <Input id="matchDate" type="date" value={formState.matchDate} onChange={onChange('matchDate')} required />
          <Text fontSize="sm" mt={3} mb={1}>Location</Text>
          <Input id="location" value={formState.location} onChange={onChange('location')} required />
          <Text fontSize="sm" mt={3} mb={1}>Home or Away</Text>
          <select id="homeOrAway" value={formState.homeOrAway} onChange={onChange('homeOrAway')}>
            <option value="home">Home</option>
            <option value="away">Away</option>
          </select>
          <HStack mt={3}>
            <Button type="submit" loading={submitting} colorScheme="blue">Save Match</Button>
            <Button variant="ghost" onClick={reset} type="button">Cancel</Button>
          </HStack>
          </form>
        </Box>
      ) : null}
      <SimpleGrid columns={{ base: 1 }} gap={4}>
        {visible.map((g) => {
          const matchDate = g.matchDate ? g.matchDate.toDate() : null
          const now = new Date()
          const isSameDay = !!matchDate &&
            matchDate.getFullYear() === now.getFullYear() &&
            matchDate.getMonth() === now.getMonth() &&
            matchDate.getDate() === now.getDate()
          const isPast = !!matchDate && matchDate.getTime() < now.getTime()
          const canSetResult = Boolean(matchDate && (isSameDay || isPast))
          return (
          <RouterLink
            key={g.id}
            to={`/games/${g.id}`}
            style={{ textDecoration: 'none' }}
            onClick={(e) => {
              // Prevent navigation while editing within the card, but allow input defaults (e.g., date picker)
              if (canManage && editingId === g.id) e.preventDefault()
            }}
          >
            <Box
              borderWidth="1px"
              borderRadius="lg"
              p={4}
              bg="white"
              boxShadow="sm"
              _hover={{ boxShadow: 'md', transform: 'translateY(-2px)' }}
              role="button"
            >
              <HStack justify="space-between" align="start">
                <Box>
                  <Heading as="h3" size="sm" mb={1}>{g.opponent}</Heading>
                  <Text color="gray.600">{formatDateLabel(g)} · {g.location || 'Location TBC'}</Text>
                </Box>
                <Box className={`tag status-${g.result}`}>
                  {g.result === 'pending' ? 'Pending' : g.result === 'win' ? 'Win' : 'Loss'}
                </Box>
              </HStack>
              <Text mt={2} color="gray.700">{g.homeOrAway === 'home' ? 'Home' : 'Away'} fixture</Text>
              {canManage ? (
                <HStack mt={3} gap={2} wrap="wrap">
                  <Button
                    size={{ base: 'xs', sm: 'sm' }}
                    onClick={(e) => { e.preventDefault(); if (canSetResult) setResult(g.id, 'win') }}
                    disabled={!canSetResult}
                    title={canSetResult ? '' : 'Results can be set on or after match day'}
                  >
                    Mark Win
                  </Button>
                  <Button
                    size={{ base: 'xs', sm: 'sm' }}
                    variant="outline"
                    onClick={(e) => { e.preventDefault(); if (canSetResult) setResult(g.id, 'loss') }}
                    disabled={!canSetResult}
                    title={canSetResult ? '' : 'Results can be set on or after match day'}
                  >
                    Mark Loss
                  </Button>
                  <Button size={{ base: 'xs', sm: 'sm' }} variant="ghost" onClick={(e) => { e.preventDefault(); openEdit(g) }}>Edit</Button>
                  <Button
                    size={{ base: 'xs', sm: 'sm' }}
                    colorScheme="red"
                    variant="outline"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteMatch(g.id) }}
                    loading={deletingId === g.id}
                  >
                    Delete
                  </Button>
                </HStack>
              ) : null}

              {canManage && editingId === g.id ? (
                <Box
                  mt={3}
                  borderWidth="1px"
                  borderRadius="md"
                  p={3}
                  bg="white"
                >
                  <form onSubmit={(e) => saveEdit(e, g.id)}>
                    <HStack gap={2} wrap="wrap">
                      <Box flex="1 1 220px">
                        <Text fontSize="sm" mb={1}>Team Name</Text>
                        <Input value={editingState.opponent} onChange={(e) => setEditingState((s) => ({ ...s, opponent: e.target.value }))} required />
                      </Box>
                      <Box flex="1 1 160px">
                        <Text fontSize="sm" mb={1}>Match Date</Text>
                        <Input type="date" value={editingState.matchDate} onChange={(e) => setEditingState((s) => ({ ...s, matchDate: e.target.value }))} />
                      </Box>
                      <Box flex="1 1 180px">
                        <Text fontSize="sm" mb={1}>Location</Text>
                        <Input value={editingState.location} onChange={(e) => setEditingState((s) => ({ ...s, location: e.target.value }))} />
                      </Box>
                      <Box flex="0 1 140px">
                        <Text fontSize="sm" mb={1}>Home/Away</Text>
                        <select value={editingState.homeOrAway} onChange={(e) => setEditingState((s) => ({ ...s, homeOrAway: e.target.value as 'home' | 'away' }))}>
                          <option value="home">Home</option>
                          <option value="away">Away</option>
                        </select>
                      </Box>
                      <Box flex="1 1 100%">
                        <Text fontSize="sm" mb={1}>Notes</Text>
                        <Input value={editingNotes} onChange={(e) => setEditingNotes(e.target.value)} placeholder="Optional notes" />
                      </Box>
                    </HStack>
                    <HStack mt={3}>
                      <Button type="submit" colorScheme="blue" loading={editingSaving} loadingText="Saving">
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); cancelEdit() }}
                      >
                        Cancel
                      </Button>
                    </HStack>
                  </form>
                </Box>
              ) : null}
            </Box>
          </RouterLink>
        )})}
        {visible.length === 0 ? <Text>No matches.</Text> : null}
      </SimpleGrid>
    </Box>
  )
}

export default GamesList
