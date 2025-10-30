import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { ChangeEvent, FormEvent } from 'react'
import { doc, increment, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { isManagerRole } from '../types/models'
import useGameTotalsForUser from '../hooks/useGameTotalsForUser'
import { Button, Alert, Box, CloseButton, Text, HStack, Badge, Stack } from '@chakra-ui/react'
import { clamp } from '../utils/stats'
import { getResultLabel, getResultTagClass } from '../utils/status'
import formatMatchDateLabel from '../utils/date'
import usePersistentState from '../hooks/usePersistentState'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import ModeToggle from '../components/ModeToggle'
import { DialogRoot, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogCloseTrigger, DialogBackdrop, DialogPositioner } from '@chakra-ui/react'
import useUserProfileByUid from '../hooks/useUserProfileByUid'
import useUserProfilesOptions from '../hooks/useUserProfilesOptions'
import useGameById from '../hooks/useGameById'
import PlayerStatsSummary from '../components/PlayerStatsSummary'
import type { SeasonGameDocument, SeasonGamePlayerStat } from '../types/models'

// type SeasonGame = SeasonGameDocument & { id: string }
type PlayerOption = { id: string; displayName: string }
type PlayerStatRow = { rowId: string; playerId: string; singlesWins: number; singlesLosses: number; doublesWins: number; doublesLosses: number; subsPaid: boolean; error?: string }

const MAX_SINGLES = 2
const MAX_DOUBLES = 1

// clamp from utils/stats
const createRowId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

const GamePage = () => {
  const params = useParams()
  const gameId = params.id as string
  const { profile, user } = useAuth()

  const { game, loading: gameLoading } = useGameById(gameId)
  const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([])
  const [rows, setRows] = useState<PlayerStatRow[]>([])
  const [error, setError] = useState<string | null>(null)
  // Removed collapse state for Player Results; always expanded
  const [showEditorModal, setShowEditorModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const myUid = user?.uid ?? ''
  const [myProfileId, setMyProfileId] = useState<string | null>(null)
  const myGameTotals = useGameTotalsForUser(gameId, myUid)

  // Team caps: 10 singles frames; 3 doubles matches => 6 player credits
  const SINGLES_TOTAL = 10
  const DOUBLES_PLAYER_TOTAL = 6

  const teamTotals = useMemo(() => {
    const sW = rows.reduce((a, r) => a + (Number(r.singlesWins) || 0), 0)
    const sL = rows.reduce((a, r) => a + (Number(r.singlesLosses) || 0), 0)
    const dW = rows.reduce((a, r) => a + (Number(r.doublesWins) || 0), 0)
    const dL = rows.reduce((a, r) => a + (Number(r.doublesLosses) || 0), 0)
    return { sW, sL, dW, dL }
  }, [rows])

  const myStats = useMemo(() => {
    if (!game) return { sW: 0, sL: 0, dW: 0, dL: 0 }
    const stats = (game.playerStats || []) as SeasonGamePlayerStat[]
    const me = stats.find((s) => s && (s.playerId === myUid || (myProfileId && s.playerId === myProfileId)))
    return {
      sW: Number(me?.singlesWins || 0),
      sL: Number(me?.singlesLosses || 0),
      dW: Number(me?.doublesWins || 0),
      dL: Number(me?.doublesLosses || 0),
    }
  }, [game, myUid, myProfileId])

  const [chartMode, setChartMode] = usePersistentState<'all' | 'singles' | 'doubles'>('gameChartMode', 'all')

  const canManage = useMemo(() => !!profile && isManagerRole(profile.role), [profile])

  const { profileId: resolvedProfileId } = useUserProfileByUid(myUid)
  useEffect(() => { setMyProfileId(resolvedProfileId ?? null) }, [resolvedProfileId])

  useEffect(() => {
    if (!game) { setRows([]); return }
    const data = game as SeasonGameDocument
    setRows(
      (data.playerStats ?? []).map((s) => ({
        rowId: createRowId(),
        playerId: s.playerId,
        singlesWins: clamp(Number(s.singlesWins ?? 0), MAX_SINGLES),
        singlesLosses: clamp(Number(s.singlesLosses ?? 0), MAX_SINGLES),
        doublesWins: clamp(Number(s.doublesWins ?? 0), MAX_DOUBLES),
        doublesLosses: clamp(Number(s.doublesLosses ?? 0), MAX_DOUBLES),
        subsPaid: Boolean((s as any).subsPaid) || false,
      })),
    )
  }, [game])

  const { options: profileOptions } = useUserProfilesOptions()
  useEffect(() => { setPlayerOptions(profileOptions) }, [profileOptions])

  const updateRow = (rowId: string, updates: Partial<PlayerStatRow>) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...updates } : r)))

  const unselectedOptions = useMemo(
    () => playerOptions.filter((p) => !rows.some((r) => r.playerId === p.id)),
    [playerOptions, rows],
  )

  const onSelect = (rowId: string) => (e: ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value
    // Duplicate prevention across rows (client-side)
    const duplicate = rows.some((r) => r.rowId !== rowId && r.playerId === nextId)
    if (duplicate) {
      updateRow(rowId, { error: 'Player already selected in another row' })
      return
    }
    updateRow(rowId, { playerId: nextId, error: undefined })
  }
  const onNum = (rowId: string, key: keyof PlayerStatRow, max: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value)
    const value = clamp(isNaN(raw) ? 0 : raw, max)
    setRows((prev) => prev.map((r) => {
      if (r.rowId !== rowId) return r
      let { singlesWins, singlesLosses, doublesWins, doublesLosses } = r
      if (key === 'singlesWins') {
        singlesWins = value
        const remaining = MAX_SINGLES - singlesWins
        if (singlesLosses > remaining) singlesLosses = remaining
      } else if (key === 'singlesLosses') {
        singlesLosses = value
        const remaining = MAX_SINGLES - singlesLosses
        if (singlesWins > remaining) singlesWins = remaining
      } else if (key === 'doublesWins') {
        doublesWins = value
        const remaining = MAX_DOUBLES - doublesWins
        if (doublesLosses > remaining) doublesLosses = remaining
      } else if (key === 'doublesLosses') {
        doublesLosses = value
        const remaining = MAX_DOUBLES - doublesLosses
        if (doublesWins > remaining) doublesWins = remaining
      }
      return { ...r, singlesWins, singlesLosses, doublesWins, doublesLosses }
    }))
  }
  const addRow = () => {
    if (unselectedOptions.length === 0) {
      setError('All available players are already added.')
      return
    }
    const next = unselectedOptions[0]
    setRows((prev) => [
      ...prev,
      { rowId: createRowId(), playerId: next.id, singlesWins: 0, singlesLosses: 0, doublesWins: 0, doublesLosses: 0, subsPaid: false },
    ])
  }
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId))

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canManage || !game) return
    if (playerOptions.length === 0) { setError('No players with profiles.'); return }

    // Validation: no duplicate playerIds
    const ids = rows.map((r) => r.playerId).filter(Boolean)
    const uniqueIds = new Set(ids)
    if (uniqueIds.size !== ids.length) {
      setError('Duplicate players not allowed. Each player may appear only once.')
      return
    }

    // Validation: team totals must not exceed caps
    const singlesTotalUsed = teamTotals.sW + teamTotals.sL
    const doublesTotalUsed = teamTotals.dW + teamTotals.dL
    if (singlesTotalUsed > SINGLES_TOTAL) {
      setError(`Singles totals exceed ${SINGLES_TOTAL}. Currently ${teamTotals.sW} wins + ${teamTotals.sL} losses = ${singlesTotalUsed}.`)
      return
    }
    if (doublesTotalUsed > DOUBLES_PLAYER_TOTAL) {
      setError(`Doubles totals exceed ${DOUBLES_PLAYER_TOTAL} player credits (3 matches × 2). Currently ${teamTotals.dW} wins + ${teamTotals.dL} losses = ${doublesTotalUsed}.`)
      return
    }

    const stats: SeasonGamePlayerStat[] = rows
      .filter((r) => r.playerId)
      .map((r) => {
        const opt = playerOptions.find((p) => p.id === r.playerId)
        // Enforce mutual constraints before saving
        const sWins = clamp(r.singlesWins, MAX_SINGLES)
        const sLoss = Math.min(clamp(r.singlesLosses, MAX_SINGLES), MAX_SINGLES - sWins)
        const dWins = clamp(r.doublesWins, MAX_DOUBLES)
        const dLoss = Math.min(clamp(r.doublesLosses, MAX_DOUBLES), MAX_DOUBLES - dWins)
        return {
          playerId: r.playerId,
          displayName: opt?.displayName ?? r.playerId,
          singlesWins: sWins,
          singlesLosses: sLoss,
          doublesWins: dWins,
          doublesLosses: dLoss,
          subsPaid: Boolean(r.subsPaid),
        }
      })

    setSubmitting(true)
    setError(null)
    try {
      await runTransaction(db, async (tx) => {
        const gameRef = doc(db, 'games', game.id)
        const prev = (game.playerStats ?? []) as SeasonGamePlayerStat[]
        const prevMap = new Map(prev.map((s) => [s.playerId, s]))
        const nextMap = new Map(stats.map((s) => [s.playerId, s]))
        const all = new Set<string>([...prevMap.keys(), ...nextMap.keys()])

        for (const pid of all) {
          const pPrev = prevMap.get(pid)
          const pNext = nextMap.get(pid)
          const prevWins = (pPrev?.singlesWins ?? 0) + (pPrev?.doublesWins ?? 0)
          const prevLoss = (pPrev?.singlesLosses ?? 0) + (pPrev?.doublesLosses ?? 0)
          const nextWins = (pNext?.singlesWins ?? 0) + (pNext?.doublesWins ?? 0)
          const nextLoss = (pNext?.singlesLosses ?? 0) + (pNext?.doublesLosses ?? 0)
          const winDiff = nextWins - prevWins
          const lossDiff = nextLoss - prevLoss

          if (winDiff === 0 && lossDiff === 0) continue

          // Update userProfiles aggregates
          const profRef = doc(db, 'userProfiles', pid)
          const profUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() }
          if (winDiff !== 0) profUpdates.totalWins = increment(winDiff)
          if (lossDiff !== 0) profUpdates.totalLosses = increment(lossDiff)
          tx.update(profRef, profUpdates)

          // Legacy players sync removed; userProfiles is the source of truth for aggregates.
        }

        tx.update(gameRef, {
          playerStats: stats,
          players: stats.map((s) => s.displayName),
          playerIds: Array.from(new Set(stats.map((s) => s.playerId))),
          updatedAt: serverTimestamp(),
        })
      })
      // Close the modal after successful save
      setShowEditorModal(false)
    } catch (err: any) {
      console.error(err)
      if (err && typeof err === 'object' && (err.code === 'permission-denied' || err.message?.includes('insufficient permissions'))) {
        setError('Permission denied. Ensure captains/vice can update userProfiles and games in Firestore rules.')
      } else {
        setError('Unable to save player results right now.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!game) return (
    <main className="container"><p>{gameLoading ? 'Loading match…' : 'Match not found.'}</p></main>
  )

  return (
    <main className="container">
      <section className="panel">
        <header>
          <h2>{game.opponent}</h2>
          <p>{formatMatchDateLabel(game.matchDate, game.notes)} · {game.location || 'Location TBC'} · {game.homeOrAway === 'home' ? 'Home' : 'Away'}</p>
        </header>
        <div className="cards-responsive cards-2col">
        {/* Match Info */}
        <article className="card">
          <h3>Match Info</h3>
          {(() => {
            const entry = myUid ? (game.playerStats || []).find((s) => s.playerId === myUid || (myProfileId && s.playerId === myProfileId)) : null
            const showSubsDue = Boolean(entry && !(entry as any).subsPaid)
            return (
              <>
                <HStack gap={2} wrap="wrap" style={{ marginTop: 4 }}>
                  <span className={`tag ${getResultTagClass(game.result)}`}>
                    {getResultLabel(game.result)}
                  </span>
                  <span className="tag">{game.homeOrAway === 'home' ? 'Home' : 'Away'}</span>
                  {showSubsDue ? (
                    <span className="tag subs-due">My Subs: Due</span>
                  ) : entry ? (
                    <span className="tag subs-paid">My Subs: Paid</span>
                  ) : null}
                </HStack>
                <Box mt={2}>
                  <Text color="gray.700">Date: {formatMatchDateLabel(game.matchDate, game.notes, 'TBC')}</Text>
                  <Text color="gray.700">Location: {game.location || 'TBC'}</Text>
                </Box>
              </>
            )
          })()}
          {myUid && (
            <Box mt={3}>
              <Text fontSize="sm" color="gray.600">My Frames</Text>
              <HStack gap={3} mt={2} style={{ flexWrap: 'wrap' }}>
                <Box borderWidth="1px" borderRadius="md" p={3} minW="120px" textAlign="center" bg="white">
                  <Text fontSize="sm" color="gray.600">Singles (W:L)</Text>
                  <Text fontSize="xl" fontWeight="bold">
                    {myGameTotals.loading ? '—' : `${myStats.sW}:${myStats.sL}`}
                  </Text>
                </Box>
                <Box borderWidth="1px" borderRadius="md" p={3} minW="120px" textAlign="center" bg="white">
                  <Text fontSize="sm" color="gray.600">Doubles (W:L)</Text>
                  <Text fontSize="xl" fontWeight="bold">
                    {myGameTotals.loading ? '—' : `${myStats.dW}:${myStats.dL}`}
                  </Text>
                </Box>
              </HStack>
            </Box>
          )}
        </article>
        
        {/* Player Results (read-only summary) */}
          <article className="card">
            <header className="card-header">
              <h3>Player Results</h3>
              {canManage ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowEditorModal(true)}
                  style={{ marginLeft: 8 }}
                >
                  Edit Results
                </button>
              ) : null}
            </header>
            <PlayerStatsSummary stats={game.playerStats || []} canManage={canManage} myUid={myUid} myProfileId={myProfileId} />
          </article>

          {/* My Match Breakdown chart with mode toggle */}
          {myUid ? (
            <article className="card">
              <header className="card-header">
                <Stack direction={{ base: 'column', sm: 'row' }} justify="space-between" align={{ base: 'start', sm: 'center' }} gap={2}>
                  <HStack gap={2} align="center">
                    <h3>My Match Breakdown</h3>
                    <Badge colorScheme={chartMode === 'all' ? 'blue' : chartMode === 'singles' ? 'cyan' : 'purple'} variant="solid" borderRadius="md">
                      {chartMode === 'all' ? 'ALL' : chartMode === 'singles' ? 'SINGLES' : 'DOUBLES'}
                    </Badge>
                  </HStack>
                  <ModeToggle value={chartMode} onChange={(m) => setChartMode(m)} />
                </Stack>
              </header>
              {(() => {
                const allWins = myStats.sW + myStats.dW
                const allLosses = myStats.sL + myStats.dL
                const wins = chartMode === 'all' ? allWins : chartMode === 'singles' ? myStats.sW : myStats.dW
                const losses = chartMode === 'all' ? allLosses : chartMode === 'singles' ? myStats.sL : myStats.dL
                const total = wins + losses
                if (total === 0) return <p className="hint">No frames recorded for the selected view.</p>
                return (
                  <>
                    <Box height="200px">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie dataKey="value" data={[{ name: 'Wins', value: wins }, { name: 'Losses', value: losses }]} innerRadius={40} outerRadius={60} paddingAngle={2}>
                            <Cell fill="#16a34a" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <Tooltip formatter={(v: any) => String(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                    <HStack gap={4} mt={2}>
                      <span className="badge role-captain">Wins: {wins}</span>
                      <span className="badge role-player">Losses: {losses}</span>
                    </HStack>
                  </>
                )
              })()}
            </article>
          ) : null}

          {/* Modal editor trigger only; editor rendered as modal below */}
        </div>
      </section>
      {/* Results Editor Modal (Chakra v3 Dialog) */}
      <DialogRoot open={showEditorModal} onOpenChange={({ open }) => setShowEditorModal(open)} modal>
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent
            style={{
              width: '100%',
              maxWidth: '100%',
              height: '90vh',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '12px',
            }}
          >
          <DialogHeader style={{ position: 'sticky', top: 0, background: 'white', zIndex: 2 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" gap={3}>
              <DialogTitle>Edit Player Results</DialogTitle>
              <DialogCloseTrigger asChild>
                <CloseButton aria-label="Close" />
              </DialogCloseTrigger>
            </Box>
          </DialogHeader>
          <DialogBody style={{ overflowY: 'auto' }}>
            {error ? (
              <Alert.Root status="error" style={{ marginBottom: '0.75rem' }}>
                <Alert.Indicator />
                <Alert.Content>{error}</Alert.Content>
              </Alert.Root>
            ) : null}
            <Box borderWidth="1px" borderRadius="md" p={3} bg="white" mb={3}>
              <HStack justify="space-between" wrap="wrap" gap={2}>
                <Text fontSize="sm">Singles used: <strong>{teamTotals.sW + teamTotals.sL}</strong> / {SINGLES_TOTAL} (W {teamTotals.sW} · L {teamTotals.sL})</Text>
                <Text fontSize="sm">Doubles used: <strong>{teamTotals.dW + teamTotals.dL}</strong> / {DOUBLES_PLAYER_TOTAL} (W {teamTotals.dW} · L {teamTotals.dL})</Text>
              </HStack>
              <Text fontSize="xs" color="gray.600" mt={1}>Note: Doubles count is per player credit (3 matches × 2 players = 6).</Text>
            </Box>
            <div className="player-result-grid">
              {rows.map((row) => (
                <Box key={row.rowId} borderWidth="1px" borderRadius="md" p={3} mb={3} bg="white" borderColor={row.error ? 'red.300' : 'gray.200'}>
                  <div className="player-result-row">
                  <label>Player
                    <select value={row.playerId} onChange={onSelect(row.rowId)} disabled={playerOptions.length === 0}>
                      <option value="">Select player…</option>
                      {playerOptions.map((p) => {
                        const alreadyChosen = rows.some((r) => r.rowId !== row.rowId && r.playerId === p.id)
                        return (
                          <option key={p.id} value={p.id} disabled={alreadyChosen}>
                            {p.displayName}
                          </option>
                        )
                      })}
                    </select>
                  </label>
                  <label>Singles Wins
                    <input type="number" min={0} max={MAX_SINGLES} value={row.singlesWins} onChange={onNum(row.rowId, 'singlesWins', MAX_SINGLES)} />
                  </label>
                  <label>Singles Losses
                    <input type="number" min={0} max={MAX_SINGLES} value={row.singlesLosses} onChange={onNum(row.rowId, 'singlesLosses', MAX_SINGLES)} />
                  </label>
                  <label>Doubles Wins
                    <input type="number" min={0} max={MAX_DOUBLES} value={row.doublesWins} onChange={onNum(row.rowId, 'doublesWins', MAX_DOUBLES)} />
                  </label>
                  <label>Doubles Losses
                    <input type="number" min={0} max={MAX_DOUBLES} value={row.doublesLosses} onChange={onNum(row.rowId, 'doublesLosses', MAX_DOUBLES)} />
                  </label>
                  <label>Subs Paid
                    <input type="checkbox" checked={row.subsPaid} onChange={(e) => updateRow(row.rowId, { subsPaid: e.target.checked })} />
                  </label>
                  {row.error ? <span className="error">{row.error}</span> : null}
                  <Button variant="outline" size="sm" onClick={() => removeRow(row.rowId)}>Remove</Button>
                  </div>
                </Box>
              ))}
            </div>
            <div className="actions" style={{ marginTop: '0.75rem' }}>
              <Button variant="outline" onClick={addRow} disabled={unselectedOptions.length === 0}>Add Player Result</Button>
            </div>
          </DialogBody>
          <DialogFooter style={{ position: 'sticky', bottom: 0, background: 'white', zIndex: 2 }}>
            <Button onClick={() => setShowEditorModal(false)} variant="ghost" style={{ marginRight: '0.75rem' }}>Cancel</Button>
            <Button colorScheme="blue" onClick={(e) => save(e as unknown as FormEvent<HTMLFormElement>)} isLoading={submitting}>Save Results</Button>
          </DialogFooter>
        </DialogContent>
      </DialogPositioner>
      </DialogRoot>
    </main>
  )
}

export default GamePage
