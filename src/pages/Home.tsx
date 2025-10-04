import { useAuth } from '../context/AuthContext'
import { useState } from 'react'
import useUserTotals from '../hooks/useUserTotals'
import { Box, Heading, Text, HStack, SimpleGrid, Button, Stack } from '@chakra-ui/react'
import { Link as RouterLink } from 'react-router-dom'

const Home = () => {
  const { user, profile } = useAuth()
  const uid = user?.uid ?? ''
  const { loading, totals, subsDueCount, subsDueGames } = useUserTotals(uid)
  const [isDialogOpen, setDialogOpen] = useState(false)
  const onOpen = () => setDialogOpen(true)
  const onClose = () => setDialogOpen(false)

  return (
    <Box>
      <Box bg="white" borderRadius="lg" boxShadow="md" p={6}>
        <HStack align="center" gap={3}>
          <Heading size="lg">{profile?.displayName ?? 'Welcome'}</Heading>
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
        <RouterLink to="/games">
          <Box borderWidth="1px" borderRadius="lg" p={5} boxShadow="sm" bg="white" _hover={{ boxShadow: 'md', transform: 'translateY(-1px)' }}>
            <Heading as="h3" size="md">Matches</Heading>
            <Text mt={1} color="gray.600">View upcoming and previous fixtures</Text>
          </Box>
        </RouterLink>
      </SimpleGrid>

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
