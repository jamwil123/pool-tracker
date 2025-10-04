import { useEffect, useMemo, useState } from 'react'
import { Timestamp, addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import type { ChangeEvent, FormEvent } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { db } from '../firebase/config'
import { seedUserProfiles } from '../utils/seedUserProfiles'
import { useAuth } from '../context/AuthContext'
import type { SeasonGameDocument } from '../types/models'
import { Box, Heading, Text, HStack, Button, SimpleGrid, Input } from '@chakra-ui/react'

type SeasonGame = SeasonGameDocument & { id: string }
type MatchFilter = 'upcoming' | 'previous'
type MatchFormState = { opponent: string; matchDate: string; location: string; homeOrAway: 'home' | 'away' }

const defaultFormState: MatchFormState = { opponent: '', matchDate: '', location: '', homeOrAway: 'home' }

const classify = (game: SeasonGame): MatchFilter => {
  if (game.matchDate instanceof Timestamp) {
    return game.matchDate.toDate().getTime() >= Date.now() ? 'upcoming' : 'previous'
  }
  return game.result === 'pending' ? 'upcoming' : 'previous'
}

const GamesList = () => {
  const { profile } = useAuth()
  const [games, setGames] = useState<SeasonGame[]>([])
  const [filter, setFilter] = useState<MatchFilter>('upcoming')
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formState, setFormState] = useState<MatchFormState>(defaultFormState)
  const [submitting, setSubmitting] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedSummary, setSeedSummary] = useState<string | null>(null)

  const canManage = useMemo(() => !!profile && (profile.role === 'captain' || profile.role === 'viceCaptain'), [profile])

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
      await updateDoc(doc(db, 'games', id), { result, updatedAt: serverTimestamp() })
    } catch (e) {
      console.error(e)
      setError('Could not update match result.')
    }
  }

  const handleSeedProfiles = async () => {
    if (!canManage || seeding) return
    setSeeding(true)
    setSeedSummary(null)
    setError(null)
    try {
      const result = await seedUserProfiles({ overwrite: false, linkUp: true, dryRun: false })
      setSeedSummary(`Seed complete. Created: ${result.creates}, updated: ${result.updates}, linked: ${result.linked}, skipped: ${result.skipped}`)
    } catch (e) {
      console.error('Seeding user profiles failed', e)
      setError('Failed to seed user profiles. Check permissions and try again.')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <Box>
      <Box as="header" mb={4}>
        <Heading size="md">Season Matches</Heading>
        <Text color="gray.600">Browse fixtures and open a match to manage results.</Text>
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
      {canManage ? (
        <Box borderWidth="1px" borderRadius="lg" p={4} bg="white" mb={4}>
          <Heading as="h3" size="sm" mb={2}>Captain Tools</Heading>
          <Text fontSize="sm" color="gray.700" mb={2}>Seed userProfiles from the users collection.</Text>
          {seedSummary ? <Text fontSize="sm" color="gray.600" mb={2}>{seedSummary}</Text> : null}
          <Button size="sm" onClick={handleSeedProfiles} isLoading={seeding} loadingText="Seeding…" colorScheme="blue">Seed User Profiles</Button>
        </Box>
      ) : null}
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
          <RouterLink key={g.id} to={`/games/${g.id}`} style={{ textDecoration: 'none' }}>
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
                  <Text color="gray.600">{g.matchDate ? g.matchDate.toDate().toLocaleDateString() : 'Date TBC'} · {g.location || 'Location TBC'}</Text>
                </Box>
                <Box className={`tag status-${g.result}`}>
                  {g.result === 'pending' ? 'Pending' : g.result === 'win' ? 'Win' : 'Loss'}
                </Box>
              </HStack>
              <Text mt={2} color="gray.700">{g.homeOrAway === 'home' ? 'Home' : 'Away'} fixture</Text>
              {canManage ? (
                <HStack mt={3}>
                  <Button
                    size="sm"
                    onClick={(e) => { e.preventDefault(); if (canSetResult) setResult(g.id, 'win') }}
                    disabled={!canSetResult}
                    title={canSetResult ? '' : 'Results can be set on or after match day'}
                  >
                    Mark Win
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.preventDefault(); if (canSetResult) setResult(g.id, 'loss') }}
                    disabled={!canSetResult}
                    title={canSetResult ? '' : 'Results can be set on or after match day'}
                  >
                    Mark Loss
                  </Button>
                </HStack>
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
