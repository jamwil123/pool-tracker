import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import useUserTotals from '../hooks/useUserTotals'
import { Box, Heading, Text, HStack, SimpleGrid, Button, Stack } from '@chakra-ui/react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { Link as RouterLink } from 'react-router-dom'
import { TEAM_NAME } from '../config/app'
import useStandings from '../hooks/useStandings'

const Home = () => {
  const { user, profile } = useAuth()
  const uid = user?.uid ?? ''
  const { loading, totals, subsDueCount, subsDueGames, nextGame } = useUserTotals(uid)
  const standings = useStandings()
  const [isDialogOpen, setDialogOpen] = useState(false)
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
              <Text color="gray.600" mt={1}>{nextGame.matchDate?.toLocaleDateString()} · {nextGame.location || 'Location TBC'}</Text>
              <Text mt={1} className={`tag ${nextGame.homeOrAway === 'home' ? 'status-win' : 'status-pending'}`}>
                {nextGame.homeOrAway === 'home' ? 'Home' : 'Away'} fixture
              </Text>
            </>
          ) : (
            <Text color="gray.600">No upcoming match scheduled.</Text>
          )}
        </Box>

        {/* Win/Loss chart */}
        <Box borderWidth="1px" borderRadius="lg" p={5} boxShadow="sm" bg="white" minH="220px">
          <Heading as="h3" size="md" mb={2}>My Wins vs Losses</Heading>
          <Box height="160px">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  dataKey="value"
                  data={[
                    { name: 'Wins', value: totals.wins },
                    { name: 'Losses', value: totals.losses },
                  ]}
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
            <span className="badge role-captain">Wins: {loading ? '—' : totals.wins}</span>
            <span className="badge role-player">Losses: {loading ? '—' : totals.losses}</span>
          </HStack>
        </Box>

        <RouterLink to="/games">
          <Box borderWidth="1px" borderRadius="lg" p={5} boxShadow="sm" bg="white" _hover={{ boxShadow: 'md', transform: 'translateY(-1px)' }}>
            <Heading as="h3" size="md">Matches</Heading>
            <Text mt={1} color="gray.600">View upcoming and previous fixtures</Text>
          </Box>
        </RouterLink>
      </SimpleGrid>

      {/* League standings (from external scraper) */}
      <Box borderWidth="1px" borderRadius="lg" p={5} boxShadow="sm" bg="white" mt={6}>
        <HStack justify="space-between" align="baseline" mb={2}>
          <Heading as="h3" size="md">League Standings</Heading>
          {standings.data?.division ? <Text color="gray.600">{standings.data.division}</Text> : null}
        </HStack>
        {standings.error ? (
          <Text color="red.600">Failed to load standings. Please try again later.</Text>
        ) : (
          <Box overflowX="auto">
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
                {standings.loading && (
                  <tr><td colSpan={10} style={{ padding: '8px' }}>Loading standings…</td></tr>
                )}
              </tbody>
            </table>
          </Box>
        )}
        <HStack justify="space-between" mt={2}>
          {standings.data?.scrapedAt ? (
            <Text color="gray.500" fontSize="sm">Updated {new Date(standings.data.scrapedAt).toLocaleString()}</Text>
          ) : <span />}
          <Text color={standings.isFallback ? 'orange.600' : 'green.600'} fontSize="sm">
            {standings.isFallback ? 'Sample data' : 'Live data'}
          </Text>
        </HStack>
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
                    <Text color="gray.600">{g.matchDate ? g.matchDate.toLocaleDateString() : 'Date TBC'}</Text>
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
