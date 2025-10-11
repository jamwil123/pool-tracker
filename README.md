# Pool Season Tracker

A Vite + React + TypeScript web app scaffolded to manage a pool team's season. It uses Firebase Authentication for secure access and Cloud Firestore to store games, players, and weekly subs data.

## Features

- Email/password login using Firebase. Only users provisioned in Firebase Auth can sign in.
- Role-aware dashboard showing captain/vice-captain controls for scheduling games, updating match results, managing player stats, and seeding roster entries.
- Firestore-backed collections for `userProfiles`, `games`, and `players` with live updates via realtime listeners.
- Player performance charts using Recharts to visualise wins and losses at a glance.
- Record singles and doubles frame results per match to keep individual stats in sync.
- Subs tracking workflow where captains can mark dues as paid for each player.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure Firebase**
   - Copy `.env.example` to `.env`.
   - Fill in your Firebase project credentials:
     ```bash
     cp .env.example .env
     ```
   - In the Firebase console, create a web app and enable **Email/Password** authentication.
   - Create the following Cloud Firestore collections:
     - `users` — pre-populate one document per teammate (use the player's name as the document ID). Optional fields such as `{ displayName, role }` can be added later. New sign-ins can link themselves to these entries (only unassigned records are offered).
     - `userProfiles` — documents keyed by user UID containing `{ displayName, role, linkedRosterId, linkedPlayerId, totalWins, totalLosses, subsStatus }`. These are created automatically after a user links to a roster entry and stay in sync with the player stats.
     - `games` — stores scheduled fixtures with `opponent`, `matchDate`, `location`, `homeOrAway`, `players`, `playerStats`, `result`, etc.
     - `players` — stores each squad member with `displayName`, `wins`, `losses`, and `subsStatus`.

3. **Run the dev server**
   ```bash
   npm run dev
   ```

## Next Steps

- Add Firebase Security Rules to ensure only authorised users can modify season data.
- Expand the data model (e.g. per-week subs history, frame scores, opponent details).
- Deploy the app via Firebase Hosting, Vercel, or Netlify once the flows are customised.

## Architecture Overview

This codebase now follows a light separation of concerns:

- Hooks (`src/hooks`)
  - `useGames` — subscribes to all games, returns `{ games, loading, error }`.
  - `useGameById` — subscribes to a single match by ID.
  - `useUserProfileByUid` — resolves the profile auto‑id for the signed‑in user.
  - `useUserProfilesOptions` — loads `{ id, displayName }` options for selects.
  - `useSeasonActions` — business actions for season logic:
    - `updateResult(gameId, 'win' | 'loss', games)` — applies season cap check and updates Firestore.
    - `importFixtures(jsonText)` — normalises input, builds stable IDs, creates docs.
    - `savePlayerStats(gameId, rows, playerOptions)` — transactional update of `games.playerStats` and user profile totals.
  - `usePersistentState` — tiny `localStorage` state helper.

- Utils (`src/utils`)
  - `date.ts` — `formatMatchDateLabel(matchDate, notes, tbcLabel?)` for consistent display.
  - `games.ts` — `classifyMatch`, `sortByUpcoming/Previous`, `toMillis`.
  - `status.ts` — `getResultLabel`, `getResultTagClass` for consistent tags.
  - `strings.ts` — `slugify` helper.
  - `fixtures.ts` — normalise/import helpers (notes/matchDate handling, stable IDs).
  - `stats.ts` — `clamp`, `computeTeamTotals`.

- Components (`src/components`)
  - `MatchCard` — presentational match card + actions.
  - `MatchInlineEdit` — inline edit panel used on the Matches page.
  - `MatchForm` — add/edit match form.
  - `ImportFixturesPanel` — manager‑only importer UI.
  - `PlayerStatsSummary` — compact chips view of player W/L.
  - `PlayerStatsEditor` — editable player results grid for a match.
  - `ModeToggle` — All/Singles/Doubles chart toggle.

- Onboarding
  - AuthContext auto‑creates a minimal `userProfiles` doc with role `pending` on first sign‑in.
  - Managers see an "Access Requests" card in Season Manager to approve/dismiss pending profiles.
  - You can still link to roster entries via ProfileSetup if you maintain a roster (`users` collection).

Pages compose these pieces; heavy logic is delegated to hooks/utils.

## Manager Tools

### Import Fixtures (in‑app)

- As a manager, open the Season Manager.
- Click "Import Fixtures" → paste a JSON array of fixtures.
- The importer:
  - Sets `matchDate` to 20:00 local using a `matchDate` string or `notes` fallback (YYYY‑MM‑DD).
  - Builds stable document IDs so re‑imports are idempotent.
  - Returns counts (created/skipped).

### Seed via Admin Script (optional)

There is a Node script to seed fixtures outside the app using the Admin SDK:

```bash
# Preview
DRY_RUN=1 npm run seed:games

# Execute using a service account (recommended)
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json
npm run seed:games

# Or set FIREBASE_SERVICE_ACCOUNT to a JSON string or file path
```

Notes:
- The script auto‑loads `.env` to detect `VITE_FIREBASE_PROJECT_ID`.
- Service account files are git‑ignored (see `.gitignore`). Never commit keys.

## Deploying Cloud Functions and Config

This repo includes a callable HTTPS function `createUsersBatch` used by the Setup Wizard to bulk‑create players.

1. Install Firebase Tools and log in:
   ```bash
   npm i -g firebase-tools
   firebase login
   ```

2. Initialize or use your existing Firebase project (ensure Firestore + Auth are enabled).

3. Deploy functions:
   ```bash
   cd functions
   npm install
   npm run build || npm run compile
   cd ..
   firebase deploy --only functions
   ```

4. Frontend function base URL
   - The app auto-falls back to `https://europe-west2-<project-id>.cloudfunctions.net` using your active Firebase project ID, so `VITE_FUNCTIONS_BASE` is optional.
   - To override explicitly, set in `.env`:
     ```
     VITE_FUNCTIONS_BASE=https://<region>-<project-id>.cloudfunctions.net
     ```

## Suggested Firestore Security Rules (outline)

These are starting points — tailor to your data.

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isCaptain() {
      return exists(/databases/$(database)/documents/userProfiles/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/userProfiles/$(request.auth.uid)).data.role in ['captain','viceCaptain'];
    }

    match /userProfiles/{uid} {
      allow read: if isSignedIn();
      // Allow users to create their own minimal pending profile
      allow create: if isSignedIn() && request.auth.uid == request.resource.data.uid &&
        request.resource.data.role == 'pending';
      // Allow user to update limited self fields (e.g., displayName)
      allow update: if isSignedIn() && request.auth.uid == uid &&
        request.resource.data.diff(resource.data).changedKeys().hasOnly(['displayName','updatedAt']);
      // Managers can update roles and totals via app workflows
      allow update: if isCaptain();
    }

    match /games/{id} {
      allow read: if true;
      allow create, update, delete: if isCaptain();
    }

    match /players/{id} {
      allow read: if isSignedIn();
      allow create, update, delete: if isCaptain();
    }
  }
}
```

This permits:
- Self‑creation of a `pending` profile on first sign‑in.
- Captains/vice to approve profiles and manage season data.
- Read access to signed‑in users (tighten as needed).

## Maintenance Utilities

Backfill `matchDate` from `notes` at 20:00 local:

```js
// In the dev browser console while signed in (manager)
const m = await import('/src/utils/maintenance.ts')
m.backfillMatchDatesFromNotes().then(console.log)
```

## Build/Runtime

- Node.js 20.19+ or 22.12+ recommended (Vite warns on older versions).
- Recharts is used for charts; consider lazy‑loading for smaller bundles if needed.

### Firebase env selection (prod vs test)

- Provide two sets of env vars in `.env`:
  - `VITE_FIREBASE_*` for production
  - `VITE_FIREBASE_TEST_*` for your test project
- On `localhost`, the app will automatically use the TEST variables unless you set:
  - `VITE_FIREBASE_USE_PROD=true` to force production locally.
- Anywhere else (e.g., Netlify), it defaults to PROD unless you explicitly set `VITE_FIREBASE_USE_TEST=true`.
