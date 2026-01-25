import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../context/AuthContext'
import { isManagerRole, type UserProfileDocument } from '../types/models'
import useStandings from '../hooks/useStandings'
import { Box, Heading, Text, SimpleGrid, HStack, Button } from '@chakra-ui/react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts'

type ProfileRow = (UserProfileDocument & { id: string })
type GameStat = { playerId: string; singlesWins: number; singlesLosses: number; doublesWins: number; doublesLosses: number; subsPaid?: boolean }

const CaptainsDashboard = () => {
  const { profile } = useAuth()
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [rosterEmails, setRosterEmails] = useState<Map<string, string>>(new Map())
  const standings = useStandings()
  const [games, setGames] = useState<Array<{ id: string; opponent: string; result: 'win' | 'loss' | 'pending'; matchDate?: Date | null; homeOrAway?: 'home' | 'away'; playerIds: string[]; stats: GameStat[] }>>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')
  // Add Profile (captain only)
  const [showAddProfile, setShowAddProfile] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [newUid, setNewUid] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<'player' | 'viceCaptain' | 'captain'>('player')
  const [linkRosterId, setLinkRosterId] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'userProfiles'), orderBy('displayName', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      const rows: ProfileRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as UserProfileDocument) }))
      setProfiles(rows)
    })
    return () => unsub()
  }, [])

  // Load roster emails for notifications (from users collection)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const map = new Map<string, string>()
      for (const d of snap.docs) {
        const data: any = d.data()
        const email = typeof data?.assignedEmail === 'string' ? data.assignedEmail : ''
        if (email) map.set(d.id, email)
      }
      setRosterEmails(map)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'games'), (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as any
        const r: 'win' | 'loss' | 'pending' = data?.result === 'win' || data?.result === 'loss' ? data.result : 'pending'
        const md = data?.matchDate && typeof data.matchDate.toDate === 'function' ? data.matchDate.toDate() as Date : null
        const ho: 'home' | 'away' = data?.homeOrAway === 'away' ? 'away' : 'home'
        const pids: string[] = Array.isArray(data?.playerIds) && data.playerIds.length
          ? data.playerIds
          : Array.isArray(data?.playerStats)
            ? Array.from(new Set((data.playerStats as any[]).map((s) => s && s.playerId).filter(Boolean)))
            : []
        const stats: GameStat[] = Array.isArray(data?.playerStats)
          ? (data.playerStats as any[]).map((s) => ({
              playerId: String(s?.playerId || ''),
              singlesWins: Number(s?.singlesWins || 0),
              singlesLosses: Number(s?.singlesLosses || 0),
              doublesWins: Number(s?.doublesWins || 0),
              doublesLosses: Number(s?.doublesLosses || 0),
              subsPaid: Boolean((s as any)?.subsPaid),
            }))
          : []
        return { id: d.id, opponent: String(data?.opponent || 'TBC'), result: r, matchDate: md, homeOrAway: ho, playerIds: pids, stats }
      })
      setGames(rows)
    })
    return () => unsub()
  }, [])

  const topFrameWins = useMemo(() => {
    // Count only games that have happened; sum singlesWins + doublesWins per player
    const now = Date.now()
    const happened = (g: typeof games[number]) => g.result !== 'pending' || (g.matchDate ? g.matchDate.getTime() < now : false)
    const map = new Map<string, number>()
    for (const g of games) {
      if (!happened(g)) continue
      for (const s of g.stats) {
        if (!s.playerId) continue
        const current = map.get(s.playerId) || 0
        const add = Number(s.singlesWins || 0) + Number(s.doublesWins || 0)
        map.set(s.playerId, current + add)
      }
    }
    const rows = profiles.map((p) => ({
      name: p.displayName,
      wins: map.get(p.id) || 0,
    }))
      .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
      .slice(0, 8)
    return rows
  }, [games, profiles])

  const teamTotals = useMemo(() => {
    const wins = profiles.reduce((a, p) => a + (Number(p.totalWins || 0)), 0)
    const losses = profiles.reduce((a, p) => a + (Number(p.totalLosses || 0)), 0)
    return { wins, losses }
  }, [profiles])

  const gameResults = useMemo(() => {
    let wins = 0, losses = 0, pending = 0
    for (const g of games) {
      if (g.result === 'win') wins++
      else if (g.result === 'loss') losses++
      else pending++
    }
    return { wins, losses, pending }
  }, [games])

  const perPlayerMatchForm = useMemo(() => {
    // Only count games that have happened: result decided OR date in past
    const now = Date.now()
    const happened = (g: typeof games[number]) => g.result !== 'pending' || (g.matchDate ? g.matchDate.getTime() < now : false)
    const totalHappened = games.filter(happened).length
    const map = new Map<string, { played: number; framesWon: number; framesLost: number }>()
    for (const g of games) {
      if (!happened(g)) continue
      const counted = new Set<string>()
      for (const s of g.stats) {
        if (!s.playerId) continue
        const rec = map.get(s.playerId) || { played: 0, framesWon: 0, framesLost: 0 }
        if (!counted.has(s.playerId)) { rec.played += 1; counted.add(s.playerId) }
        rec.framesWon += (Number(s.singlesWins || 0) + Number(s.doublesWins || 0))
        rec.framesLost += (Number(s.singlesLosses || 0) + Number(s.doublesLosses || 0))
        map.set(s.playerId, rec)
      }
    }
    const rows = profiles.map((p) => {
      const e = map.get(p.id) || { played: 0, framesWon: 0, framesLost: 0 }
      const totalFrames = e.framesWon + e.framesLost
      const pct = totalFrames > 0 ? Math.round((e.framesWon / totalFrames) * 100) : 0
      return { id: p.id, name: p.displayName, played: e.played, framesWon: e.framesWon, framesLost: e.framesLost, pct, happened: totalHappened }
    }).filter((r) => r.played > 0)
      .sort((a, b) => b.pct - a.pct || b.played - a.played)
      .slice(0, 8)
    return rows
  }, [games, profiles])

  const unpaidSubs = useMemo(() => {
    const now = Date.now()
    const happened = (g: typeof games[number]) => g.result !== 'pending' || (g.matchDate ? g.matchDate.getTime() < now : false)
    const list: Array<{ pid: string; name: string; email?: string; gameId: string; opponent: string; date: Date | null; amount: number }> = []
    for (const g of games) {
      if (!happened(g)) continue
      for (const s of g.stats) {
        if (!s.playerId) continue
        if (!s.subsPaid) {
          const prof = profiles.find((p) => p.id === s.playerId)
          const name = prof?.displayName || s.playerId
          const rosterId = prof?.linkedRosterId
          const email = rosterId ? rosterEmails.get(rosterId) : undefined
          list.push({ pid: s.playerId, name, email, gameId: g.id, opponent: g.opponent, date: g.matchDate || null, amount: 2 })
        }
      }
    }
    const total = list.reduce((a, x) => a + x.amount, 0)
    return { list, total }
  }, [games, profiles, rosterEmails])

  // Team means across finished games
  const teamMeans = useMemo(() => {
    const now = Date.now()
    const happened = (g: typeof games[number]) => g.result !== 'pending' || (g.matchDate ? g.matchDate.getTime() < now : false)
    const finished = games.filter(happened)
    const n = finished.length
    if (n === 0) return { avgFramesWon: 0, avgFramesLost: 0, avgPlayers: 0, matchWinRate: 0, avgUniqueFramesWon: 0, avgUniqueFramesLost: 0 }

    let framesWon = 0
    let framesLost = 0
    let playersTotal = 0
    let wins = 0
    let uniqueWinsTotal = 0
    let uniqueLossTotal = 0

    for (const g of finished) {
      const pset = new Set<string>()
      let gameSinglesWins = 0
      let gameSinglesLosses = 0
      let gameDoublesWins = 0
      let gameDoublesLosses = 0
      for (const s of g.stats) {
        if (!s) continue
        framesWon += (Number(s.singlesWins || 0) + Number(s.doublesWins || 0))
        framesLost += (Number(s.singlesLosses || 0) + Number(s.doublesLosses || 0))
        gameSinglesWins += Number(s.singlesWins || 0)
        gameSinglesLosses += Number(s.singlesLosses || 0)
        gameDoublesWins += Number(s.doublesWins || 0)
        gameDoublesLosses += Number(s.doublesLosses || 0)
        if (s.playerId) pset.add(s.playerId)
      }
      // Unique frames: count doubles once (two players share the credit)
      uniqueWinsTotal += gameSinglesWins + (gameDoublesWins / 2)
      uniqueLossTotal += gameSinglesLosses + (gameDoublesLosses / 2)
      playersTotal += pset.size
      if (g.result === 'win') wins++
    }

    return {
      avgFramesWon: framesWon / n,
      avgFramesLost: framesLost / n,
      avgPlayers: playersTotal / n,
      matchWinRate: (wins / n) * 100,
      avgUniqueFramesWon: uniqueWinsTotal / n,
      avgUniqueFramesLost: uniqueLossTotal / n,
    }
  }, [games])

  // Per-player means across finished games (only players with at least 1 frame)
  const playerMeans = useMemo(() => {
    const now = Date.now()
    const happened = (g: typeof games[number]) => g.result !== 'pending' || (g.matchDate ? g.matchDate.getTime() < now : false)
    const finished = games.filter(happened)
    const per = new Map<string, { w: number; l: number }>()
    for (const g of finished) {
      for (const s of g.stats) {
        if (!s || !s.playerId) continue
        const prev = per.get(s.playerId) || { w: 0, l: 0 }
        prev.w += (Number(s.singlesWins || 0) + Number(s.doublesWins || 0))
        prev.l += (Number(s.singlesLosses || 0) + Number(s.doublesLosses || 0))
        per.set(s.playerId, prev)
      }
    }
    const rows = Array.from(per.values()).filter((r) => (r.w + r.l) > 0)
    const n = rows.length
    if (n === 0) return { avgPlayerFramesWon: 0, avgPlayerFramesLost: 0, meanPlayerFrameWinPct: 0, playersCount: 0 }
    let sumW = 0, sumL = 0, sumPct = 0
    for (const r of rows) {
      sumW += r.w
      sumL += r.l
      sumPct += (r.w / (r.w + r.l)) * 100
    }
    return {
      avgPlayerFramesWon: sumW / n,
      avgPlayerFramesLost: sumL / n,
      meanPlayerFrameWinPct: sumPct / n,
      playersCount: n,
    }
  }, [games])


  const leagueOutlook = useMemo(() => {
    const data = standings.data
    if (!data || !Array.isArray(data.standings) || data.standings.length === 0) return null
    const pts = (n: any) => Number(n || 0)
    const sorted = [...data.standings].sort((a, b) => pts(b.points) - pts(a.points))
    const leader = sorted[0]
    const us = sorted.find((r) => r.team && r.team.toLowerCase().includes('union jack club b')) || null
    if (!us) return null
    const TOTAL_GAMES = 18
    // Count our happened games using the local schedule (team-only collection)
    const now = Date.now()
    const happened = (g: typeof games[number]) => g.result !== 'pending' || (g.matchDate ? g.matchDate.getTime() < now : false)
    const ourHappened = games.filter(happened).length
    const remaining = Math.max(0, TOTAL_GAMES - ourHappened)
    const ourPoints = pts(us.points)
    const leaderPoints = pts(leader.points)
    const isLeader = ourPoints >= leaderPoints
    if (isLeader) {
      return { isLeader: true, leaderTeam: leader.team, ourPoints, leaderPoints, remaining }
    }
    const neededPointsToPass = leaderPoints - ourPoints + 1 // need at least 1 point more than leader now (optimistic)
    const neededWins = Math.max(0, Math.min(remaining, Math.ceil(neededPointsToPass / 2)))
    return { isLeader: false, leaderTeam: leader.team, ourPoints, leaderPoints, remaining, neededWins }
  }, [standings.data, games])

  if (!profile || !isManagerRole(profile.role)) {
    return (
      <main className="container">
        <section className="panel">
          <header>
            <h2>Restricted</h2>
            <p>This dashboard is for captains and vice captains.</p>
          </header>
        </section>
      </main>
    )
  }

  return (
    <main className="container">
      <section className="panel">
        <header>
          <h2>Captain's Dashboard</h2>
          <p>Quick view of player form and league outlook.</p>
        </header>

        {/* Add User Profile */}
        <Box borderWidth="1px" borderRadius="lg" p={5} bg="white" mb={4}>
          <HStack justify="space-between" align="center" mb={2}>
            <Heading as="h3" size="md">Add User Profile</Heading>
            <Button size="sm" variant="outline" onClick={() => setShowAddProfile((v) => !v)}>
              {showAddProfile ? 'Hide' : 'New Profile'}
            </Button>
          </HStack>
          {showAddProfile ? (
            <Box as="form" onSubmit={async (e) => {
              e.preventDefault()
              setAddError(null)
              const uid = newUid.trim()
              const name = newName.trim()
              if (!uid) { setAddError('Enter the Firebase Auth UID (copy from Console).'); return }
              if (!name) { setAddError('Enter a display name.'); return }
              setAdding(true)
              try {
                const payload: any = {
                  uid,
                  displayName: name,
                  role: newRole,
                  linkedRosterId: linkRosterId.trim() || '',
                  linkedPlayerId: null,
                  totalWins: 0,
                  totalLosses: 0,
                  subsStatus: 'due',
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                }
                const ref = await addDoc(collection(db, 'userProfiles'), payload)
                if (linkRosterId.trim()) {
                  try {
                    await updateDoc(doc(db, 'users', linkRosterId.trim()), {
                      assignedUid: uid,
                      linkedProfileUid: ref.id,
                      assignedAt: serverTimestamp(),
                    })
                  } catch (e) {
                    // Non-fatal if roster doc does not exist
                    console.warn('Roster link failed:', e)
                  }
                }
                setNewUid('')
                setNewName('')
                setNewRole('player')
                setLinkRosterId('')
                setShowAddProfile(false)
              } catch (err: any) {
                console.error(err)
                setAddError('Failed to create user profile. Check rules and try again.')
              } finally {
                setAdding(false)
              }
            }}>
              {addError ? <Text color="red.600" mb={2}>{addError}</Text> : null}
              <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
                <Box>
                  <Text fontSize="sm" mb={1}>Firebase Auth UID</Text>
                  <input type="text" value={newUid} onChange={(e) => setNewUid(e.target.value)} placeholder="UID (copy from Firebase Auth)" />
                </Box>
                <Box>
                  <Text fontSize="sm" mb={1}>Display Name</Text>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g., John Smith" />
                </Box>
                <Box>
                  <Text fontSize="sm" mb={1}>Role</Text>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                    <option value="player">Player</option>
                    <option value="viceCaptain">Vice Captain</option>
                    <option value="captain">Captain</option>
                  </select>
                </Box>
                <Box>
                  <Text fontSize="sm" mb={1}>Link Roster Doc (optional)</Text>
                  <input type="text" value={linkRosterId} onChange={(e) => setLinkRosterId(e.target.value)} placeholder="users/{docId}" />
                </Box>
              </SimpleGrid>
              <HStack mt={3}>
                <Button type="submit" colorScheme="blue" loading={adding}>Create Profile</Button>
                <Button type="button" variant="ghost" onClick={() => setShowAddProfile(false)}>Cancel</Button>
              </HStack>
            </Box>
          ) : (
            <Text color="gray.600">Create a profile doc for a user you already added in Firebase Auth. Paste the user’s UID from the Auth Console.</Text>
          )}
        </Box>

        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
          <Box borderWidth="1px" borderRadius="lg" p={5} bg="white">
            <Heading as="h3" size="md" mb={2}>Top Players (Frame Wins)</Heading>
            <Box height="240px">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topFrameWins} margin={{ left: -20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="wins" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
            <Text color="gray.600" mt={2}>Top 8 by total frames won (singles + doubles) in finished games.</Text>
          </Box>

          <Box borderWidth="1px" borderRadius="lg" p={5} bg="white">
            <Heading as="h3" size="md" mb={2}>Team Wins vs Losses</Heading>
            <Box height="220px">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie dataKey="value" data={[{ name: 'Wins', value: teamTotals.wins }, { name: 'Losses', value: teamTotals.losses }]} innerRadius={50} outerRadius={70}>
                    <Cell fill="#16a34a" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Box>
            <Text color="gray.600" mt={2}>Aggregate across all player profiles.</Text>
          </Box>

          <Box borderWidth="1px" borderRadius="lg" p={5} bg="white">
            <Heading as="h3" size="md" mb={2}>Match Results (Team)</Heading>
            <Box height="220px">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie dataKey="value" data={[
                    { name: 'Wins', value: gameResults.wins },
                    { name: 'Losses', value: gameResults.losses },
                    { name: 'Pending', value: gameResults.pending },
                  ]} innerRadius={50} outerRadius={70}>
                    <Cell fill="#16a34a" />
                    <Cell fill="#ef4444" />
                    <Cell fill="#9ca3af" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Box>
            <Text color="gray.600" mt={2}>From games collection: W {gameResults.wins} · L {gameResults.losses} · Pending {gameResults.pending}</Text>
          </Box>

          <Box borderWidth="1px" borderRadius="lg" p={5} bg="white">
            <Heading as="h3" size="md" mb={2}>Top Match Win % (Players)</Heading>
            {perPlayerMatchForm.length === 0 ? (
              <Text color="gray.600">No finished games recorded yet.</Text>
            ) : (
              <Box as="ul" ml={0} pl={0} style={{ listStyle: 'none' }}>
                {perPlayerMatchForm.map((r) => (
                  <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #e5e7eb' }}>
                    <span style={{ fontWeight: 500 }}>{r.name}</span>
                    <span style={{ color: '#4b5563' }}>{r.pct}% (frames {r.framesWon}:{r.framesLost}) · games {r.played}/{r.happened}</span>
                  </li>
                ))}
              </Box>
            )}
            <Text color="gray.600" fontSize="sm" mt={2}>Counts only games that have happened; percentage = matches won / matches played.</Text>
          </Box>

          <Box borderWidth="1px" borderRadius="lg" p={5} bg="white">
            <Heading as="h3" size="md" mb={2}>Unpaid Subs</Heading>
            {unpaidSubs.list.length === 0 ? (
              <Text color="gray.600">No unpaid subs at the moment.</Text>
            ) : (
              <Box>
                {unpaidSubs.list.map((e, idx) => (
                  <HStack key={`${e.pid}-${e.gameId}-${idx}`} justify="space-between" borderBottom="1px solid #e5e7eb" py={2}>
                    <Box>
                      <Text fontWeight={500}>{e.name}</Text>
                      <Text color="gray.600" fontSize="sm">{e.opponent} — {e.date ? e.date.toLocaleDateString() : 'Date TBC'}</Text>
                    </Box>
                    <HStack>
                      <Text>£{e.amount.toFixed(2)}</Text>
                      {e.email ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            const email = e.email || ''
                            const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Subs Due')}&body=${encodeURIComponent(`Hi ${e.name.split(' ')[0]},\n\nJust a reminder: your £2 subs for ${e.opponent} (${e.date ? e.date.toLocaleDateString() : 'recent match'}) are due next time you're in.\n\nThanks!`)}`
                            window.location.href = mailto
                          }}
                        >
                          Email
                        </Button>
                      ) : null}
                    </HStack>
                  </HStack>
                ))}
                <HStack justify="space-between" mt={3}>
                  <Text fontWeight={600}>Total Due</Text>
                  <Text fontWeight={700}>£{unpaidSubs.total.toFixed(2)}</Text>
                </HStack>
              </Box>
            )}
            <Text color="gray.600" fontSize="sm" mt={2}>Assumes £2 per unpaid match per player.</Text>
          </Box>

          <Box borderWidth="1px" borderRadius="lg" p={5} bg="white">
            <Heading as="h3" size="md" mb={2}>League Outlook</Heading>
            {!standings.data ? (
              <Text color="gray.600">Loading standings…</Text>
            ) : leagueOutlook ? (
              <>
                <Text>Leader: {leagueOutlook.leaderTeam} — {leagueOutlook.leaderPoints} pts</Text>
                <Text>Us: {leagueOutlook.ourPoints} pts</Text>
                <Text mt={2}>Remaining games: {leagueOutlook.remaining}</Text>
                {leagueOutlook.isLeader ? (
                  <Text mt={2} color="green.700">You're at the top of the league — keep winning and it's yours.</Text>
                ) : (
                  <>
                    <Text mt={2}>To win the league (assuming other results go your way), aim to win at least <strong>{leagueOutlook.neededWins}</strong> of the remaining <strong>{leagueOutlook.remaining}</strong> games.</Text>
                    <Text color="gray.600" fontSize="sm" mt={2}>Estimate: 2 points per win; this is optimistic and ignores other teams' future results.</Text>
                  </>
                )}
              </>
            ) : (
              <Text color="gray.600">Unable to compute outlook from current standings.</Text>
            )}
          </Box>
        </SimpleGrid>

        {/* Team averages across finished matches */}
        <Box borderWidth="1px" borderRadius="lg" p={5} bg="white" mt={4}>
          <Heading as="h3" size="md" mb={2}>Team Averages</Heading>
          {(() => {
            const now = Date.now()
            const finishedCount = games.filter((g) => g.result !== 'pending' || (g.matchDate ? g.matchDate.getTime() < now : false)).length
            if (finishedCount === 0) {
              return <Text color="gray.600">No finished games to calculate means yet.</Text>
            }
            return (
              <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} gap={4}>
                <Box>
                  <Text color="gray.600" fontSize="sm">Avg Frames Won / Match</Text>
                  <Text fontWeight={700}>{teamMeans.avgFramesWon.toFixed(2)}</Text>
                  {(() => {
                    const creditsMax = 16 // 10 singles + 6 doubles player credits
                    const uniqueMax = 13 // 10 singles + 3 doubles
                    const pctCredits = creditsMax ? (teamMeans.avgFramesWon / creditsMax) * 100 : 0
                    return (
                      <Text color="gray.600" fontSize="xs">
                        Credits: {teamMeans.avgFramesWon.toFixed(2)} / {creditsMax} ({pctCredits.toFixed(0)}%) · Unique: ~{teamMeans.avgUniqueFramesWon.toFixed(2)} / {uniqueMax} (Target ≥ 7)
                      </Text>
                    )
                  })()}
                </Box>
                <Box>
                  <Text color="gray.600" fontSize="sm">Avg Frames Lost / Match</Text>
                  <Text fontWeight={700}>{teamMeans.avgFramesLost.toFixed(2)}</Text>
                </Box>
                <Box>
                  <Text color="gray.600" fontSize="sm">Avg Players Used</Text>
                  <Text fontWeight={700}>{teamMeans.avgPlayers.toFixed(2)}</Text>
                </Box>
                <Box>
                  <Text color="gray.600" fontSize="sm">Match Win Rate</Text>
                  <Text fontWeight={700}>{teamMeans.matchWinRate.toFixed(1)}%</Text>
                </Box>
              </SimpleGrid>
            )
          })()}
        </Box>

        {/* Player averages across finished matches */}
        <Box borderWidth="1px" borderRadius="lg" p={5} bg="white" mt={4}>
          <Heading as="h3" size="md" mb={2}>Player Averages</Heading>
          {playerMeans.playersCount === 0 ? (
            <Text color="gray.600">No player frames recorded yet.</Text>
          ) : (
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap={4}>
              <Box>
                <Text color="gray.600" fontSize="sm">Avg Frames Won / Player</Text>
                <Text fontWeight={700}>{playerMeans.avgPlayerFramesWon.toFixed(2)}</Text>
              </Box>
              <Box>
                <Text color="gray.600" fontSize="sm">Avg Frames Lost / Player</Text>
                <Text fontWeight={700}>{playerMeans.avgPlayerFramesLost.toFixed(2)}</Text>
              </Box>
              <Box>
                <Text color="gray.600" fontSize="sm">Mean Player Frame Win %</Text>
                <Text fontWeight={700}>{playerMeans.meanPlayerFrameWinPct.toFixed(1)}%</Text>
              </Box>
            </SimpleGrid>
          )}
        </Box>

        {/* Player insights (detailed) */}
        <Box borderWidth="1px" borderRadius="lg" p={5} bg="white" mt={4}>
          <HStack justify="space-between" align="center" mb={3}>
            <Heading as="h3" size="md">Player Insights</Heading>
            <HStack>
              <label htmlFor="player-select" style={{ fontSize: 12, color: '#4b5563' }}>Player</label>
              <select id="player-select" value={selectedPlayerId} onChange={(e) => setSelectedPlayerId(e.target.value)}>
                <option value="">Choose player…</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </HStack>
          </HStack>
          {(() => {
            const pid = selectedPlayerId
            if (!pid) return <Text color="gray.600">Pick a player to view detailed stats.</Text>
            const now = Date.now()
            const happened = (g: typeof games[number]) => g.result !== 'pending' || (g.matchDate ? g.matchDate.getTime() < now : false)
            const finished = games.filter(happened)
            const played = finished.filter((g) => g.stats.some((s) => s.playerId === pid))
            const finishedCount = finished.length
            const matchesPlayed = played.length
            let w = 0, l = 0, sw = 0, sl = 0, dw = 0, dl = 0
            let teamWinsWith = 0, teamLossWith = 0
            let homeW = 0, homeL = 0, awayW = 0, awayL = 0
            let subsDue = 0
            const perMatch: Array<{ id: string; date: Date | null; opponent: string; homeOrAway: 'home' | 'away'; sw: number; sl: number; dw: number; dl: number; team: 'win' | 'loss' | 'pending'; subs: boolean }>
              = []
            for (const g of played) {
              const stat = g.stats.find((s) => s.playerId === pid)
              const _sw = Number(stat?.singlesWins || 0)
              const _sl = Number(stat?.singlesLosses || 0)
              const _dw = Number(stat?.doublesWins || 0)
              const _dl = Number(stat?.doublesLosses || 0)
              const _subs = Boolean(stat && !(stat as any).subsPaid)
              if (_subs) subsDue += 1
              w += _sw + _dw
              l += _sl + _dl
              sw += _sw
              sl += _sl
              dw += _dw
              dl += _dl
              if (g.result === 'win') teamWinsWith += 1
              else if (g.result === 'loss') teamLossWith += 1
              if (g.homeOrAway === 'home') { homeW += _sw + _dw; homeL += _sl + _dl } else { awayW += _sw + _dw; awayL += _sl + _dl }
              perMatch.push({ id: g.id, date: g.matchDate || null, opponent: g.opponent, homeOrAway: g.homeOrAway || 'home', sw: _sw, sl: _sl, dw: _dw, dl: _dl, team: g.result, subs: _subs })
            }
            const framesPlayed = w + l
            const selectionRate = finishedCount ? (matchesPlayed / finishedCount) * 100 : 0
            const frameWR = framesPlayed ? (w / framesPlayed) * 100 : 0
            const singlesPlayed = sw + sl
            const doublesPlayed = dw + dl
            const singlesWR = singlesPlayed ? (sw / singlesPlayed) * 100 : 0
            const doublesWR = doublesPlayed ? (dw / doublesPlayed) * 100 : 0
            const framesWonPerMatch = matchesPlayed ? w / matchesPlayed : 0
            const last5 = [...perMatch].sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0)).slice(-5)
            const last5W = last5.reduce((acc, r) => acc + (r.sw + r.dw), 0)
            const last5L = last5.reduce((acc, r) => acc + (r.sl + r.dl), 0)
            const last5WR = (last5W + last5L) ? (last5W / (last5W + last5L)) * 100 : 0
            const contribDen = finished
              .reduce((acc, g) => acc + g.stats.reduce((a, s) => a + (Number(s.singlesWins || 0) + Number(s.doublesWins || 0)), 0), 0)
            const contribShare = contribDen ? (w / contribDen) * 100 : 0
            const prof = profiles.find((p) => p.id === pid)
            return (
              <>
                <HStack justify="space-between" align="center" mb={3}>
                  <Text><strong>{prof?.displayName || pid}</strong> — {prof?.role || 'player'}</Text>
                  <Text color="gray.600" fontSize="sm">Selected {matchesPlayed}/{finishedCount} finished games ({selectionRate.toFixed(0)}%)</Text>
                </HStack>
                <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} gap={4}>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Frames Won / Played</Text>
                    <Text fontWeight={700}>{w} / {framesPlayed}</Text>
                    <Text color="gray.600" fontSize="xs">Win rate {frameWR.toFixed(1)}%</Text>
                  </Box>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Singles W/L</Text>
                    <Text fontWeight={700}>{sw}:{sl}</Text>
                    <Text color="gray.600" fontSize="xs">Win rate {singlesWR.toFixed(1)}%</Text>
                  </Box>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Doubles W/L</Text>
                    <Text fontWeight={700}>{dw}:{dl}</Text>
                    <Text color="gray.600" fontSize="xs">Win rate {doublesWR.toFixed(1)}%</Text>
                  </Box>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Frames Won / Match</Text>
                    <Text fontWeight={700}>{framesWonPerMatch.toFixed(2)}</Text>
                  </Box>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Team Result With Player</Text>
                    <Text fontWeight={700}>W {teamWinsWith} · L {teamLossWith}</Text>
                  </Box>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Home vs Away (Frames)</Text>
                    <Text fontWeight={700}>Home {homeW}:{homeL} · Away {awayW}:{awayL}</Text>
                  </Box>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Last 5 (Frames)</Text>
                    <Text fontWeight={700}>{last5WR.toFixed(1)}%</Text>
                  </Box>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Contribution Share</Text>
                    <Text fontWeight={700}>{contribShare.toFixed(1)}%</Text>
                  </Box>
                  <Box>
                    <Text color="gray.600" fontSize="sm">Unpaid Subs</Text>
                    <Text fontWeight={700}>{subsDue}</Text>
                  </Box>
                </SimpleGrid>
                <Box mt={4}>
                  <Text fontWeight={600} mb={2}>Recent Matches</Text>
                  <Box overflowX="auto">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px' }}>Date</th>
                          <th style={{ textAlign: 'left', padding: '6px' }}>Opponent</th>
                          <th style={{ textAlign: 'left', padding: '6px' }}>H/A</th>
                          <th style={{ textAlign: 'right', padding: '6px' }}>Singles</th>
                          <th style={{ textAlign: 'right', padding: '6px' }}>Doubles</th>
                          <th style={{ textAlign: 'left', padding: '6px' }}>Team</th>
                          <th style={{ textAlign: 'left', padding: '6px' }}>Subs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...perMatch].sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)).slice(0, 8).map((r) => (
                          <tr key={r.id}>
                            <td style={{ padding: '6px' }}>{r.date ? r.date.toLocaleDateString() : 'TBC'}</td>
                            <td style={{ padding: '6px' }}>{r.opponent}</td>
                            <td style={{ padding: '6px' }}>{r.homeOrAway === 'home' ? 'Home' : 'Away'}</td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>{r.sw}:{r.sl}</td>
                            <td style={{ padding: '6px', textAlign: 'right' }}>{r.dw}:{r.dl}</td>
                            <td style={{ padding: '6px' }}>{r.team === 'pending' ? 'Pending' : (r.team === 'win' ? 'Win' : 'Loss')}</td>
                            <td style={{ padding: '6px' }}>{r.subs ? 'Due' : 'Paid'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                </Box>
              </>
            )
          })()}
        </Box>
      </section>
    </main>
  )
}

export default CaptainsDashboard
