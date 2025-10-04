import './App.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginForm from './components/LoginForm'
import { BrowserRouter, Link as RouterLink, Route, Routes, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
const Home = lazy(() => import('./pages/Home'))
const GamesList = lazy(() => import('./pages/GamesList'))
const GamePage = lazy(() => import('./pages/GamePage'))
const CaptainsDashboardLazy = lazy(() => import('./pages/CaptainsDashboard'))
import { Box, Container, Flex, Heading, Text, Button, HStack } from '@chakra-ui/react'
import { APP_TITLE, TEAM_NAME } from './config/app'
import ProfileSetup from './components/ProfileSetup'
import { isManagerRole } from './types/models'

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
          <Box>
            <Heading size="lg">{APP_TITLE}</Heading>
            <Text mt={1}>{TEAM_NAME}</Text>
            <Text mt={1}>Signed in as {user.email} · Complete setup</Text>
            <Flex align="center" justify="space-between" gap={4} mt={3} wrap="wrap">
              <Box />
              <Button onClick={signOut} colorScheme="blue" variant="solid">Sign Out</Button>
            </Flex>
          </Box>
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
          <Box>
            <Heading size="lg">{APP_TITLE}</Heading>
            <Text mt={1}>{TEAM_NAME}</Text>
            <Text mt={1}>Signed in as {user.email} · Role: {profile.role}</Text>
            <Flex align="center" justify="space-between" gap={4} mt={3} wrap="wrap">
              <HStack gap={4} as="nav">
                <RouterLink to="/">Home</RouterLink>
                <RouterLink to="/games">Matches</RouterLink>
                {isManagerRole(profile.role) ? <RouterLink to="/dashboard">Captain's Dashboard</RouterLink> : null}
              </HStack>
              <Button onClick={signOut} colorScheme="blue" variant="solid">Sign Out</Button>
            </Flex>
          </Box>
        </Box>
        <Box mt={6}>
          <Suspense fallback={<div>Loading…</div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/games" element={<GamesList />} />
              <Route path="/games/:id" element={<GamePage />} />
              <Route path="/dashboard" element={isManagerRole(profile.role) ? <CaptainsDashboardLazy /> : <Navigate to="/" replace />} />
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
