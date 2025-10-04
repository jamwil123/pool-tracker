import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
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
  const [games, setGames] = useState<Array<{ id: string; opponent: string; result: 'win' | 'loss' | 'pending'; matchDate?: Date | null; playerIds: string[]; stats: GameStat[] }>>([])

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
        return { id: d.id, opponent: String(data?.opponent || 'TBC'), result: r, matchDate: md, playerIds: pids, stats }
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
    const entries: Array<{ pid: string; name: string; email?: string; gameId: string; opponent: string; date: Date | null; amount: number }>[] = [] as any
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
                        <Button as="a" href={`mailto:${encodeURIComponent(e.email)}?subject=${encodeURIComponent('Subs Due')}&body=${encodeURIComponent(`Hi ${e.name.split(' ')[0]},\n\nJust a reminder: your £2 subs for ${e.opponent} (${e.date ? e.date.toLocaleDateString() : 'recent match'}) are due next time you're in.\n\nThanks!`)}`} size="xs" variant="outline">Email</Button>
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
      </section>
    </main>
  )
}

export default CaptainsDashboard
