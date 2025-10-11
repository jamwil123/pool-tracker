import { onRequest } from 'firebase-functions/v2/https'
import { setGlobalOptions, logger } from 'firebase-functions/v2'

setGlobalOptions({ region: 'europe-west2', memory: '256MiB', timeoutSeconds: 30 })

// Public standings API base
const REMOTE = 'https://scrapecleaguetable-wbv6pvivda-nw.a.run.app/'

export const standingsProxy = onRequest(async (req, res) => {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const resp = await fetch(REMOTE, { headers: { 'Accept': 'application/json' } })
    const text = await resp.text()
    // Forward status; Cloud Run returns 200 OK per your tests
    res.status(resp.status).type('application/json').send(text)
  } catch (e: any) {
    logger.error('standingsProxy failed', e)
    res.status(502).json({ error: 'Bad Gateway', message: e?.message || 'fetch failed' })
  }
})

// Batch create users (captain-only)
