import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import type { UserProfileDocument } from '../types/models'

type UserProfile = UserProfileDocument

type AuthContextValue = {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

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
      const profileRef = doc(db, 'userProfiles', authUser.uid)
      unsubscribeProfile = onSnapshot(
        profileRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as UserProfile
            setProfile(data)
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

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      signIn: handleSignIn,
      signOut: handleSignOut,
    }),
    [user, profile, loading],
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
