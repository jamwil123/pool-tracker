import './App.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginForm from './components/LoginForm'
import { BrowserRouter, Link as RouterLink, Route, Routes, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
const Home = lazy(() => import('./pages/Home'))
const GamesList = lazy(() => import('./pages/GamesList'))
const GamePage = lazy(() => import('./pages/GamePage'))
import { Box, Container, Flex, Heading, Text, Button, HStack } from '@chakra-ui/react'
import ProfileSetup from './components/ProfileSetup'

const AppShell = () => {
  const { user, profile, loading, signOut } = useAuth()
  const needsSetup = !profile || !profile.linkedRosterId || !profile.displayName || String(profile.displayName).trim().length === 0

  if (loading) {
    return (
      <main className="container">
        <p>Loading…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="container">
        <LoginForm />
      </main>
    )
  }

  if (needsSetup) {
    return (
      <BrowserRouter>
        <Container maxW="6xl" py={8}>
          <Box className="app-header" as="header" p={6} borderRadius="lg" boxShadow="md" bg="white">
            <Flex align="center" justify="space-between" gap={6} wrap="wrap">
              <Box>
                <Heading size="lg">Pool Season Tracker</Heading>
                <Text mt={1}>Signed in as {user.email} · Complete setup</Text>
              </Box>
              <Button onClick={signOut} colorScheme="blue" variant="solid">Sign Out</Button>
            </Flex>
          </Box>
          <Box mt={6}>
            <Routes>
              <Route path="/setup" element={<ProfileSetup />} />
              <Route path="*" element={<Navigate to="/setup" replace />} />
            </Routes>
          </Box>
        </Container>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <Container maxW="6xl" py={8}>
        <Box className="app-header" as="header" p={6} borderRadius="lg" boxShadow="md" bg="white">
          <Flex align="center" justify="space-between" gap={6} wrap="wrap">
            <Box>
              <Heading size="lg">Pool Season Tracker</Heading>
              <Text mt={1}>Signed in as {user.email} · Role: {profile.role}</Text>
              <HStack gap={4} mt={2} as="nav">
                <RouterLink to="/">Home</RouterLink>
                <RouterLink to="/games">Matches</RouterLink>
              </HStack>
            </Box>
            <Button onClick={signOut} colorScheme="blue" variant="solid">Sign Out</Button>
          </Flex>
        </Box>
        <Box mt={6}>
          <Suspense fallback={<div>Loading…</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/games" element={<GamesList />} />
              <Route path="/games/:id" element={<GamePage />} />
              <Route path="/setup" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Box>
      </Container>
    </BrowserRouter>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
