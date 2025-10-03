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
