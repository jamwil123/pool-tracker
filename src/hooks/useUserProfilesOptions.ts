import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'

export type PlayerOption = { id: string; displayName: string }

const useUserProfilesOptions = () => {
  const [options, setOptions] = useState<PlayerOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'userProfiles'), orderBy('displayName', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      const rows: PlayerOption[] = snap.docs.map((d) => {
        const data = d.data() as any
        const displayName = typeof data.displayName === 'string' && data.displayName.trim().length
          ? data.displayName.trim() : d.id
        return { id: d.id, displayName }
      })
      rows.sort((a, b) => a.displayName.localeCompare(b.displayName))
      setOptions(rows)
      setLoading(false)
    }, () => setLoading(false))
    return () => unsub()
  }, [])

  return { loading, options }
}

export default useUserProfilesOptions

