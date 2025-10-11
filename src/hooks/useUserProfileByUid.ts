import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'

export type UserProfileDoc = { id: string; data: any } | null

const useUserProfileByUid = (uid: string | null | undefined) => {
  const [loading, setLoading] = useState<boolean>(Boolean(uid))
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profile, setProfile] = useState<any | null>(null)

  useEffect(() => {
    if (!uid) { setProfileId(null); setProfile(null); setLoading(false); return }
    const q = query(collection(db, 'userProfiles'), where('uid', '==', uid), limit(1))
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setProfileId(snap.docs[0].id)
        setProfile(snap.docs[0].data())
      } else {
        setProfileId(null)
        setProfile(null)
      }
      setLoading(false)
    }, () => setLoading(false))
    return () => unsub()
  }, [uid])

  return { loading, profileId, profile }
}

export default useUserProfileByUid

