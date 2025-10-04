import { useEffect, useState } from 'react'
import { STANDINGS_API_URL } from '../config/app'

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
  // no artificial delay; show data as soon as it arrives

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

    let lastErrMessage: string | null = null
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal, headers: { Accept: 'application/json' } as any })
        setLastUrl(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        // Try parsing JSON; if content-type is not JSON but body is JSON, still parse
        const ct = res.headers.get('content-type') || ''
        console.log('[standings] fetch ok', { url, status: res.status, contentType: ct })
        const text = await res.text()
        try {
          console.log('[standings] raw body first 400 chars:', text.slice(0, 400))
        } catch {}
        let parsed: any
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new Error('Invalid JSON')
        }
        // Handle possible wrappers: { data: {...} } or { result: {...} }
        let payload: any = parsed
        if (Array.isArray(parsed)) {
          payload = { standings: parsed }
        }
        if (!Array.isArray(payload?.standings)) {
          if (Array.isArray(payload?.data?.standings)) payload = payload.data
          else if (Array.isArray(payload?.result?.standings)) payload = payload.result
        }
        const rows = (payload.standings || []).map((r: any, i: number) => {
          const gf = Number(r.gf || (r.raw?.[6] ?? 0))
          const ga = Number(r.ga || (r.raw?.[7] ?? 0))
          const gdStr = (r.gd ?? '').toString().trim()
          const gd = gdStr.length ? gdStr : String(gf - ga)
          const position = (r.position ?? '').toString().trim() || (r.raw?.[0] ?? String(i + 1))
          return { ...r, gd, position }
        })
        const normalized: StandingsPayload = {
          division: String(payload.division ?? ''),
          scrapedAt: String(payload.scrapedAt ?? new Date().toISOString()),
          source: String(payload.source ?? ''),
          standings: rows,
        }
        console.log('[standings] parsed rows:', rows.length)
        setData(normalized)
        setLoading(false)
        return
      } catch (e: any) {
        lastErrMessage = e?.message || String(e)
        console.warn('[standings] fetch/parse failed for', url, lastErrMessage)
        continue
      }
    }
    setData(null)
    setError('Failed to load standings')
    setErrorDetail(`${lastErrMessage || ''}${lastUrl ? ` from ${lastUrl}` : ''}`.trim())
    setLoading(false)
  }

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    return () => { ac.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reload = () => load()

  return { loading, error, errorDetail, data, reload, usedUrl: lastUrl }
}

export default useStandings
