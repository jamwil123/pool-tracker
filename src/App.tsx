import './App.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginForm from './components/LoginForm'
import SeasonManager from './components/SeasonManager'
import PlayerStats from './components/PlayerStats'
import ProfileSetup from './components/ProfileSetup'

const AppShell = () => {
  const { user, profile, loading, signOut } = useAuth()

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

  if (!profile) {
    return <ProfileSetup />
  }

  return (
    <main className="container">
      <header className="app-header">
        <div>
          <h1>Pool Season Tracker</h1>
          <p>
            Signed in as {user.email} · Role: {profile.role}
          </p>
        </div>
        <button type="button" onClick={signOut}>
          Sign Out
        </button>
      </header>
      <section className="panels">
        <SeasonManager />
        <PlayerStats />
      </section>
    </main>
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
