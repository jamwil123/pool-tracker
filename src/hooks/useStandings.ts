import { useEffect, useState } from 'react'
import { STANDINGS_API_URL } from '../config/app'
import { SAMPLE_STANDINGS } from '../config/sampleStandings'

export type StandingRow = {
  position: string
  team: string
  played: string
  won: string
  drawn: string
  lost: string
  gf: string
  ga: string
  gd: string
  points: string
  raw?: string[]
}

export type StandingsPayload = {
  division: string
  scrapedAt: string
  source: string
  standings: StandingRow[]
}

export const useStandings = () => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [data, setData] = useState<StandingsPayload | null>(null)
  const [lastUrl, setLastUrl] = useState<string | null>(null)
  const [isFallback, setIsFallback] = useState<boolean>(false)

  const load = async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    setErrorDetail(null)
    setData(null)
    const baseCandidates = [
      '/api/standings',
      (import.meta as any).env?.VITE_STANDINGS_API_URL as string | undefined,
      STANDINGS_API_URL,
    ].filter(Boolean) as string[]

    // Expand candidates with common variants (trailing slash, /standings)
    const urls: string[] = []
    for (const base of baseCandidates) {
      urls.push(base)
      if (!base.endsWith('/')) urls.push(base + '/')
      urls.push(base.replace(/\/$/, '') + '/standings')
    }

    let lastErr: any = null
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal, headers: { Accept: 'application/json' } as any })
        setLastUrl(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        // Try parsing JSON; if content-type is not JSON but body is JSON, still parse
        const text = await res.text()
        const json = JSON.parse(text) as StandingsPayload
        const rows = (json.standings || []).map((r, i) => {
          const gf = Number(r.gf || (r.raw?.[6] ?? 0))
          const ga = Number(r.ga || (r.raw?.[7] ?? 0))
          const gdStr = (r.gd ?? '').toString().trim()
          const gd = gdStr.length ? gdStr : String(gf - ga)
          const position = (r.position ?? '').toString().trim() || (r.raw?.[0] ?? String(i + 1))
          return { ...r, gd, position }
        })
        setData({ ...json, standings: rows })
        setIsFallback(false)
        setLoading(false)
        return
      } catch (e: any) {
        lastErr = e
        continue
      }
    }
    // Fallback to sample so the UI still renders data
    const rows = (SAMPLE_STANDINGS.standings || []).map((r, i) => {
      const gf = Number(r.gf || (r.raw?.[6] ?? 0))
      const ga = Number(r.ga || (r.raw?.[7] ?? 0))
      const gdStr = (r.gd ?? '').toString().trim()
      const gd = gdStr.length ? gdStr : String(gf - ga)
      const position = (r.position ?? '').toString().trim() || (r.raw?.[0] ?? String(i + 1))
      return { ...r, gd, position }
    })
    setData({ ...SAMPLE_STANDINGS, standings: rows })
    setIsFallback(true)
    setError(null)
    setErrorDetail(null)
    setLoading(false)
  }

  useEffect(() => {
    let alive = true
    const ac = new AbortController()
    load(ac.signal)
    return () => { alive = false; ac.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reload = () => load()

  return { loading, error, errorDetail, data, reload, isFallback, usedUrl: lastUrl }
}

export default useStandings
