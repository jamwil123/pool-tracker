// Seed games into Firestore using Firebase Admin SDK
// Usage options:
//   - Default (uses built-in DEFAULT_DATA):
//       npm run seed:games
//   - From file path:
//       npm run seed:games -- ./path/to/games.json
//   - With env flags:
//       DRY_RUN=1 OVERWRITE=1 npm run seed:games -- ./path/to/games.json
//
// Auth options (choose one):
//   - export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
//   - export FIREBASE_SERVICE_ACCOUNT to a JSON string or a file path

import fs from 'node:fs'
import path from 'node:path'
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// ---------- Config / Flags ----------
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const OVERWRITE = process.env.OVERWRITE === '1' || process.env.OVERWRITE === 'true'

let PROJECT_ID_HINT

// Try to load .env so VITE_FIREBASE_PROJECT_ID is available to this Node script
function loadDotEnv() {
  try {
    const p = path.resolve(process.cwd(), '.env')
    if (!fs.existsSync(p)) return
    const text = fs.readFileSync(p, 'utf8')
    for (const lineRaw of text.split(/\r?\n/)) {
      const line = lineRaw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let val = line.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch {}
}
loadDotEnv()

function loadServiceAccount() {
  const env = process.env
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const json = JSON.parse(fs.readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))
      if (json && typeof json.project_id === 'string') PROJECT_ID_HINT = json.project_id
    } catch {}
    return applicationDefault()
  }

  const svc = env.FIREBASE_SERVICE_ACCOUNT
  if (!svc) return applicationDefault()

  try {
    const maybe = svc.trim()
    if (maybe.startsWith('{')) {
      const json = JSON.parse(maybe)
      if (json && typeof json.project_id === 'string') PROJECT_ID_HINT = json.project_id
      return cert(json)
    }
    const p = path.resolve(process.cwd(), maybe)
    const json = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (json && typeof json.project_id === 'string') PROJECT_ID_HINT = json.project_id
    return cert(json)
  } catch (err) {
    console.warn('Failed to load FIREBASE_SERVICE_ACCOUNT; using ADC:', err?.message)
    return applicationDefault()
  }
}

function tryLocalServiceAccount() {
  // Fallback: look for a local file in repo root (ignored by .gitignore)
  const candidates = [
    'pool-firebase-config.json',
    'firebase-admin.json',
    'serviceAccount.json',
  ]
  for (const name of candidates) {
    const p = path.resolve(process.cwd(), name)
    if (fs.existsSync(p)) {
      try {
        const json = JSON.parse(fs.readFileSync(p, 'utf8'))
        if (json && typeof json.project_id === 'string') PROJECT_ID_HINT = json.project_id
        return cert(json)
      } catch (e) {
        console.warn(`Found ${name} but failed to parse as JSON:`, e?.message)
      }
    }
  }
  return null
}

let credential = loadServiceAccount()
// If loadServiceAccount returned ADC and no envs set, try local file fallback
try {
  // applicationDefault exposes a getAccessToken method; cert() returns an object
  const usedADC = !process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_SERVICE_ACCOUNT
  if (usedADC) {
    const local = tryLocalServiceAccount()
    if (local) credential = local
  }
} catch {}
const projectId =
  process.env.VITE_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  PROJECT_ID_HINT

if (!projectId) {
  console.error('No projectId found. Set VITE_FIREBASE_PROJECT_ID in .env or FIREBASE_PROJECT_ID env var.')
  process.exit(1)
}

const app = initializeApp({ credential, projectId })
const db = getFirestore(app)

// ---------- Helpers ----------
const serverTimestamp = FieldValue.serverTimestamp()

const slugify = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '')

const normalizeHomeOrAway = (v) => (v === 'away' ? 'away' : 'home')

const toDateOrNull = (v) => {
  if (!v) return null
  if (v instanceof Date) return v
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t) return null
    // Supports YYYY-MM-DD
    const d = new Date(t)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

// Build a Date at 20:00 local for a given YYYY-MM-DD string
const dateAt20LocalFromString = (s) => {
  const d = toDateOrNull(s)
  if (!d) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0, 0, 0)
}

const normalizeGame = (raw) => {
  const opponent = typeof raw.opponent === 'string' ? raw.opponent.trim() : 'TBC'
  const location = typeof raw.location === 'string' ? raw.location.trim() : ''
  const notes = typeof raw.notes === 'string' && raw.notes.trim().length ? raw.notes.trim() : null
  const homeOrAway = normalizeHomeOrAway(raw.homeOrAway)
  // Prefer explicit matchDate; otherwise derive from notes (YYYY-MM-DD) at 20:00 local
  let matchDate = null
  if (raw.matchDate) matchDate = toDateOrNull(raw.matchDate)
  if (!matchDate && notes) matchDate = dateAt20LocalFromString(notes)
  const players = Array.isArray(raw.players) ? raw.players : []
  const playerStats = Array.isArray(raw.playerStats) ? raw.playerStats : []
  const result = raw.result === 'win' || raw.result === 'loss' ? raw.result : 'pending'

  return {
    opponent,
    matchDate, // Firestore will store Date as Timestamp
    location,
    homeOrAway,
    players,
    playerStats,
    result,
    notes,
    createdAt: serverTimestamp,
    updatedAt: serverTimestamp,
  }
}

const buildStableId = (g) => {
  const dateLabel = g.notes || (g.matchDate ? g.matchDate.toISOString().slice(0, 10) : 'tbc')
  const opp = slugify(g.opponent)
  return `match-${dateLabel}-${g.homeOrAway}-${opp}`
}

// ---------- Input ----------
const DEFAULT_DATA = [
  {
    opponent: "Washhouse Miners",
    matchDate: null,
    location: "Miners Arms",
    homeOrAway: "away",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2025-10-16",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "Roundabout",
    matchDate: null,
    location: "Roundabout",
    homeOrAway: "away",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2025-10-23",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "Railway Club",
    matchDate: null,
    location: "Railway Club",
    homeOrAway: "away",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2025-10-30",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "Roundabout",
    matchDate: null,
    location: "Union Jack Club",
    homeOrAway: "home",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2025-11-06",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "Vinnies",
    matchDate: null,
    location: "Vinnies",
    homeOrAway: "away",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2025-11-13",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "Grapes B",
    matchDate: null,
    location: "Union Jack Club",
    homeOrAway: "home",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2025-11-20",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "JJ's E",
    matchDate: null,
    location: "Union Jack Club",
    homeOrAway: "home",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2025-11-27",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "Vinnies",
    matchDate: null,
    location: "Union Jack Club",
    homeOrAway: "home",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2025-12-04",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "Grapes B",
    matchDate: null,
    location: "Grapes",
    homeOrAway: "away",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2025-12-18",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "Union Jack A",
    matchDate: null,
    location: "Union Jack Club",
    homeOrAway: "home",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2026-01-08",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "JJ's D",
    matchDate: null,
    location: "JJ's",
    homeOrAway: "away",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2026-01-15",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "Washhouse Miners",
    matchDate: null,
    location: "Union Jack Club",
    homeOrAway: "home",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2026-02-12",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "JJ's E",
    matchDate: null,
    location: "JJ's",
    homeOrAway: "away",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2026-03-05",
    createdAt: null,
    updatedAt: null
  },
  {
    opponent: "JJ's E",
    matchDate: null,
    location: "Union Jack Club",
    homeOrAway: "home",
    players: [],
    playerStats: [],
    result: "pending",
    notes: "2026-04-02",
    createdAt: null,
    updatedAt: null
  }
]

function loadInput() {
  const argPath = process.argv[2]
  if (argPath) {
    const p = path.resolve(process.cwd(), argPath)
    const json = JSON.parse(fs.readFileSync(p, 'utf8'))
    if (!Array.isArray(json)) throw new Error('Input JSON must be an array')
    return json
  }
  if (process.env.INPUT) {
    const json = JSON.parse(process.env.INPUT)
    if (!Array.isArray(json)) throw new Error('INPUT must be a JSON array')
    return json
  }
  return DEFAULT_DATA
}

async function seedGames() {
  const raw = loadInput()
  console.log(`Loaded ${raw.length} match rows`)

  let creates = 0
  let updates = 0
  let skips = 0

  for (const row of raw) {
    const game = normalizeGame(row)
    const id = buildStableId(game)
    const ref = db.collection('games').doc(id)
    const snap = await ref.get()

    if (DRY_RUN) {
      console.log(`[DRY_RUN] ${snap.exists ? 'update' : 'create'} games/${id}`, game)
      continue
    }

    if (snap.exists && !OVERWRITE) {
      skips++
      continue
    }

    await ref.set(game, { merge: OVERWRITE })
    if (snap.exists) updates++
    else creates++
  }

  console.log(
    DRY_RUN
      ? `DRY_RUN complete.`
      : `Seeding complete. Created: ${creates}, Updated: ${updates}, Skipped: ${skips}`
  )
}

seedGames().catch((err) => {
  console.error('Seeding failed:', err)
  process.exit(1)
})
