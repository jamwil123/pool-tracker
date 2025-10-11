import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { SeasonGameDocument } from '../types/models'
import { db } from '../firebase/config'

export type SeasonGame = SeasonGameDocument & { id: string }

export const useGames = () => {
  const [games, setGames] = useState<SeasonGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'games'), orderBy('matchDate', 'asc'))
    const unsub = onSnapshot(q, (snap) => {
      const rows: SeasonGame[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as SeasonGameDocument) }))
      setGames(rows)
      setError(null)
      setLoading(false)
    }, (e) => {
      console.error(e)
      setError('Unable to load matches right now.')
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return { games, loading, error }
}

export default useGames

