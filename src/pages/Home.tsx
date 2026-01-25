import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import useUserTotals from '../hooks/useUserTotals'
import { Box, Heading, Text, HStack, SimpleGrid, Button, Stack, Spinner, Center, Badge } from '@chakra-ui/react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { Link as RouterLink } from 'react-router-dom'
import { TEAM_NAME } from '../config/app'
import useStandings from '../hooks/useStandings'
import useMyPlayerMetrics from '../hooks/useMyPlayerMetrics'
import ModeToggle from '../components/ModeToggle'
import formatMatchDateLabel from '../utils/date'
import usePersistentState from '../hooks/usePersistentState'

const Home = () => {
  const { user, profile } = useAuth()
  const uid = user?.uid ?? ''
  const { loading, totals, singles, subsDueCount, subsDueGames, nextGame } = useUserTotals(uid)
  const myMetrics = useMyPlayerMetrics(uid)
  const standings = useStandings()
  const [isDialogOpen, setDialogOpen] = useState(false)
  const [chartMode, setChartMode] = usePersistentState<'all' | 'singles' | 'doubles'>('homeChartMode', 'all')
  const onOpen = () => setDialogOpen(true)
  const onClose = () => setDialogOpen(false)

  return (
    <Box>
      <Box bg="white" borderRadius="lg" boxShadow="md" p={6}>
        <HStack align="center" gap={3}>
          <Heading size="lg">{profile?.displayName ?? 'Welcome'}</Heading>
          <Text color="gray.600">{TEAM_NAME}</Text>
          {profile ? (
            <span className={`tag status-${profile.role === 'captain' ? 'win' : profile.role === 'viceCaptain' ? 'pending' : 'loss'}`}>
              {profile.role === 'captain' ? 'Captain' : profile.role === 'viceCaptain' ? 'Vice Captain' : 'Player'}
            </span>
          ) : null}
        </HStack>
        {user && profile ? (
          <HStack mt={4} gap={4} style={{ flexWrap: 'wrap' }}>
            <Box borderWidth="1px" borderRadius="md" p={4} minW="140px">
              <Text fontSize="sm" color="gray.600">Wins</Text>
              <Text fontSize="2xl" fontWeight="bold">{loading ? '—' : totals.wins}</Text>
            </Box>
            <Box borderWidth="1px" borderRadius="md" p={4} minW="140px">
              <Text fontSize="sm" color="gray.600">Losses</Text>
              <Text fontSize="2xl" fontWeight="bold">{loading ? '—' : totals.losses}</Text>
            </Box>
            {subsDueCount > 0 ? (
              <button
                type="button"
                className={`tag subs-due`}
                onClick={onOpen}
                title="View unpaid matches"
                style={{ cursor: 'pointer' }}
              >
                {`Subs Due (${subsDueCount})`}
              </button>
            ) : (
              <span className={`tag subs-paid`}>Subs Paid</span>
            )}
          </HStack>
        ) : (
          <Text className="hint" mt={2}>Sign in to view your details.</Text>
        )}
      </Box>

      <SimpleGrid columns={{ base: 1, sm: 2 }} gap={4} mt={6}>
        {/* Upcoming match card */}
        <Box borderWidth="1px" borderRadius="lg" p={5} boxShadow="sm" bg="white">
          <Heading as="h3" size="md" mb={2}>Upcoming Match</Heading>
          {nextGame ? (
            <>
              <Text fontWeight="medium">{nextGame.opponent}</Text>
              <Text color="gray.600" mt={1}>{formatMatchDateLabel(nextGame.matchDate, (nextGame as any).notes)} · {nextGame.location || 'Location TBC'}</Text>
              <Text mt={1} className={`tag ${nextGame.homeOrAway === 'home' ? 'status-win' : 'status-pending'}`}>
                {nextGame.homeOrAway === 'home' ? 'Home' : 'Away'} fixture
              </Text>
            </>
          ) : (
            <Text color="gray.600">No upcoming match scheduled.</Text>
          )}
        </Box>

        {/* Win/Loss chart with mode toggle */}
        <Box borderWidth="1px" borderRadius="lg" p={5} boxShadow="sm" bg="white" minH="220px">
          <Stack direction={{ base: 'column', sm: 'row' }} justify="space-between" align={{ base: 'start', sm: 'center' }} mb={3} gap={2}>
            <HStack gap={2} align="center">
              <Heading as="h3" size="md">
                {chartMode === 'all' ? 'My Wins vs Losses' : chartMode === 'singles' ? 'My Singles W/L' : 'My Doubles W/L'}
              </Heading>
              <Badge colorScheme={chartMode === 'all' ? 'blue' : chartMode === 'singles' ? 'cyan' : 'purple'} variant="solid" borderRadius="md">
                {chartMode === 'all' ? 'ALL' : chartMode === 'singles' ? 'SINGLES' : 'DOUBLES'}
              </Badge>
            </HStack>
            <ModeToggle value={chartMode} onChange={(m) => setChartMode(m)} />
          </Stack>
          <Box height="160px">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  dataKey="value"
                  data={(function() {
                    const allWins = totals.wins || 0
                    const allLosses = totals.losses || 0
                    const sWins = singles.wins || 0
                    const sLosses = singles.losses || 0
                    const dWins = Math.max(0, allWins - sWins)
                    const dLosses = Math.max(0, allLosses - sLosses)
                    const wins = chartMode === 'all' ? allWins : chartMode === 'singles' ? sWins : dWins
                    const losses = chartMode === 'all' ? allLosses : chartMode === 'singles' ? sLosses : dLosses
                    return [
                      { name: 'Wins', value: wins },
                      { name: 'Losses', value: losses },
                    ]
                  })()}
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                >
                  <Cell fill="#16a34a" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip formatter={(v) => String(v)} />
              </PieChart>
            </ResponsiveContainer>
          </Box>
          <HStack gap={4} mt={2}>
            {(() => {
              const allWins = totals.wins || 0
              const allLosses = totals.losses || 0
              const sWins = singles.wins || 0
              const sLosses = singles.losses || 0
              const dWins = Math.max(0, allWins - sWins)
              const dLosses = Math.max(0, allLosses - sLosses)
              const wins = chartMode === 'all' ? allWins : chartMode === 'singles' ? sWins : dWins
              const losses = chartMode === 'all' ? allLosses : chartMode === 'singles' ? sLosses : dLosses
              return (
                <>
                  <span className="badge role-captain">Wins: {loading ? '—' : wins}</span>
                  <span className="badge role-player">Losses: {loading ? '—' : losses}</span>
                </>
              )
            })()}
          </HStack>
        </Box>

        <RouterLink to="/games">
          <Box borderWidth="1px" borderRadius="lg" p={5} boxShadow="sm" bg="white" _hover={{ boxShadow: 'md', transform: 'translateY(-1px)' }}>
            <Heading as="h3" size="md">Matches</Heading>
            <Text mt={1} color="gray.600">View upcoming and previous fixtures</Text>
          </Box>
        </RouterLink>
      </SimpleGrid>

      {/* My Metrics */}
      <Box borderWidth="1px" borderRadius="lg" p={5} boxShadow="sm" bg="white" mt={6}>
        <Heading as="h3" size="md" mb={2}>My Metrics</Heading>
        {!uid ? (
          <Text color="gray.600">Sign in to view your metrics.</Text>
        ) : myMetrics.loading ? (
          <Text color="gray.600">Calculating…</Text>
        ) : (
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} gap={4}>
            <Box>
              <Text color="gray.600" fontSize="sm">Selection Rate</Text>
              <Text fontWeight={700}>{myMetrics.selectionRatePct.toFixed(0)}%</Text>
              <Text color="gray.600" fontSize="xs">Played {myMetrics.matchesPlayed} of {myMetrics.finishedMatches} finished matches</Text>
            </Box>
            <Box>
              <Text color="gray.600" fontSize="sm">Frame Win Rate</Text>
              <Text fontWeight={700}>{myMetrics.frameWinRatePct.toFixed(1)}%</Text>
              <Text color="gray.600" fontSize="xs">Wins {myMetrics.frameWins} · Losses {myMetrics.frameLosses}</Text>
            </Box>
            <Box>
              <Text color="gray.600" fontSize="sm">Frames Won / Match</Text>
              <Text fontWeight={700}>{myMetrics.framesWonPerMatch.toFixed(2)}</Text>
              <Text color="gray.600" fontSize="xs">Credits, when selected</Text>
            </Box>
            <Box>
              <Text color="gray.600" fontSize="sm">Singles Win Rate</Text>
              <Text fontWeight={700}>{myMetrics.singlesWinRatePct.toFixed(1)}%</Text>
            </Box>
            <Box>
              <Text color="gray.600" fontSize="sm">Doubles Win Rate</Text>
              <Text fontWeight={700}>{myMetrics.doublesWinRatePct.toFixed(1)}%</Text>
            </Box>
            <Box>
              <Text color="gray.600" fontSize="sm">Last 5 (Frames)</Text>
              <Text fontWeight={700}>{myMetrics.last5FrameWinRatePct.toFixed(1)}%</Text>
              <Text color="gray.600" fontSize="xs">Win rate over most recent 5 finished matches</Text>
            </Box>
            <Box>
              <Text color="gray.600" fontSize="sm">Contribution Share</Text>
              <Text fontWeight={700}>{myMetrics.contributionSharePct.toFixed(1)}%</Text>
              <Text color="gray.600" fontSize="xs">Of team frame wins (credits) across finished matches</Text>
            </Box>
          </SimpleGrid>
        )}
      </Box>

      {/* League standings (from external scraper) */}
      <Box borderWidth="1px" borderRadius="lg" p={5} boxShadow="sm" bg="white" mt={6}>
        <HStack justify="space-between" align="center" mb={2}>
          <HStack gap={3} align="baseline">
            <Heading as="h3" size="md">League Standings</Heading>
            {standings.data?.division ? <Text color="gray.600">{standings.data.division}</Text> : null}
          </HStack>
          <Button size="sm" variant="outline" onClick={() => standings.reload()} disabled={standings.loading}>
            {standings.loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </HStack>
        {standings.data ? (
          <>
            {/* Mobile compact list */}
            <Box display={{ base: 'block', sm: 'none' }}>
              <Stack gap={2}>
                {(standings.data?.standings || []).map((row) => (
                  <Box
                    key={row.team}
                    borderWidth="1px"
                    borderRadius="md"
                    p={3}
                    bg={row.team === TEAM_NAME ? 'blue.50' : 'white'}
                  >
                    <HStack justify="space-between" align="baseline">
                      <Text fontWeight={row.team === TEAM_NAME ? 'semibold' : 'normal'}>{row.team}</Text>
                      <Text fontWeight="bold">{row.points} pts</Text>
                    </HStack>
                    <Text color="gray.600" fontSize="sm" mt={1}>
                      Pos {row.position || '-' } · P {row.played} · {row.won}-{row.drawn}-{row.lost} · GF {row.gf}:{row.ga} · GD {row.gd}
                    </Text>
                  </Box>
                ))}
              </Stack>
            </Box>
            {/* Desktop/tablet full table */}
            <Box overflowX="auto" display={{ base: 'none', sm: 'block' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Pos</th>
                    <th style={{ textAlign: 'left', padding: '6px' }}>Team</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>P</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>W</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>D</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>L</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>GF</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>GA</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>GD</th>
                    <th style={{ textAlign: 'right', padding: '6px' }}>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {(standings.data?.standings || []).map((row) => (
                    <tr key={row.team} style={{ background: row.team === TEAM_NAME ? 'rgba(59,130,246,.08)' : 'transparent' }}>
                      <td style={{ padding: '6px' }}>{row.position || ''}</td>
                      <td style={{ padding: '6px', fontWeight: row.team === TEAM_NAME ? 600 : 400 }}>{row.team}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{row.played}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{row.won}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{row.drawn}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{row.lost}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{row.gf}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{row.ga}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{row.gd}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            {/* Legend */}
            <Text color="gray.600" fontSize="sm" mt={2}>
              Legend: Pos = Position · P = Played · W = Won · D = Drawn · L = Lost · GF = For · GA = Against · GD = Difference · Pts = Points
            </Text>
          </>
        ) : standings.loading ? (
          <Center py={6}>
            <HStack gap={3}>
              <Spinner size="sm" />
              <Text color="gray.600">Loading standings…</Text>
            </HStack>
          </Center>
        ) : (
          <Box>
            <Text color="red.600">Failed to load standings. Please try again later.</Text>
            {standings.errorDetail ? (
              <Text color="red.500" fontSize="sm" mt={1}>{standings.errorDetail}</Text>
            ) : null}
          </Box>
        )}
        {standings.data?.scrapedAt ? (
          <Text color="gray.500" fontSize="sm" mt={2}>Updated {new Date(standings.data.scrapedAt).toLocaleString()}</Text>
        ) : null}
      </Box>

      {isDialogOpen ? (
        <Box
          position="fixed"
          inset={0}
          bg="blackAlpha.600"
          zIndex={1000}
          onClick={onClose}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={4}
        >
          <Box
            bg="white"
            borderRadius="lg"
            boxShadow="xl"
            maxW="md"
            width="100%"
            p={4}
            onClick={(e) => e.stopPropagation()}
          >
            <Heading as="h3" size="md" mb={3}>Unpaid Matches</Heading>
            <Stack gap={2}>
              {subsDueCount === 0 ? (
                <Text>All set — no unpaid subs.</Text>
              ) : (
                subsDueGames.map((g) => (
                  <Box key={g.id} borderWidth="1px" borderRadius="md" p={3}>
                    <Text fontWeight="semibold">{g.opponent}</Text>
                    <Text color="gray.600">{formatMatchDateLabel(g.matchDate, (g as any).notes)}</Text>
                  </Box>
                ))
              )}
              <HStack justify="end" mt={2}>
                <Button onClick={onClose}>Close</Button>
              </HStack>
            </Stack>
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}

export default Home
