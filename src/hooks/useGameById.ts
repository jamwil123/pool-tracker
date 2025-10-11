import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { SeasonGameDocument } from '../types/models'

export type SeasonGame = SeasonGameDocument & { id: string }

const useGameById = (id: string | null | undefined) => {
  const [loading, setLoading] = useState<boolean>(Boolean(id))
  const [game, setGame] = useState<SeasonGame | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) { setGame(null); setLoading(false); return }
    const ref = doc(db, 'games', id)
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) { setGame(null); setLoading(false); return }
      setGame({ id: snap.id, ...(snap.data() as SeasonGameDocument) })
      setError(null)
      setLoading(false)
    }, () => { setError('Unable to load match.'); setLoading(false) })
    return () => unsub()
  }, [id])

  return { loading, game, error }
}

export default useGameById
