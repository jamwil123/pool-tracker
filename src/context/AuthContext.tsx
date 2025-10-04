import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import type { UserProfileDocument, Role } from '../types/models'
import { isRole } from '../types/models'

type UserProfile = UserProfileDocument

type AuthContextValue = {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  spoofRole: Role | null
  setRoleSpoof: (role: Role | null) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [spoofRole, setSpoofRole] = useState<Role | null>(() => {
    try {
      // Only allow spoofing in dev/local environments
      const dev = (import.meta as any).env?.DEV === true || typeof window !== 'undefined' && window.location?.hostname === 'localhost'
      if (!dev) return null
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('roleSpoof') : null
      return isRole(raw) ? (raw as Role) : null
    } catch { return null }
  })

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null

    const unsubscribeAuth = onAuthStateChanged(auth, (authUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile()
        unsubscribeProfile = null
      }

      setUser(authUser)

      if (!authUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      setLoading(true)
      const q = query(collection(db, 'userProfiles'), where('uid', '==', authUser.uid), limit(1))
      unsubscribeProfile = onSnapshot(
        q,
        (snapshot) => {
          if (!snapshot.empty) {
            const data = snapshot.docs[0].data() as UserProfile
            setProfile(spoofRole ? { ...data, role: spoofRole } : data)
          } else {
            setProfile(null)
          }
          setLoading(false)
        },
        (error) => {
          console.error('Failed to fetch profile', error)
          setProfile(null)
          setLoading(false)
        },
      )
    })

    return () => {
      if (unsubscribeProfile) {
        unsubscribeProfile()
      }
      unsubscribeAuth()
    }
  }, [])

  const handleSignIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const handleSignOut = async () => {
    await firebaseSignOut(auth)
  }

  const setRoleSpoof = (role: Role | null) => {
    try {
      const dev = (import.meta as any).env?.DEV === true || typeof window !== 'undefined' && window.location?.hostname === 'localhost'
      if (!dev) return
      setSpoofRole(role)
      if (typeof window !== 'undefined') {
        if (role) window.localStorage.setItem('roleSpoof', role)
        else window.localStorage.removeItem('roleSpoof')
      }
      setProfile((prev) => (prev ? ({ ...prev, role: role ?? prev.role }) : prev))
    } catch {}
  }

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      signIn: handleSignIn,
      signOut: handleSignOut,
      spoofRole,
      setRoleSpoof,
    }),
    [user, profile, loading, spoofRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
