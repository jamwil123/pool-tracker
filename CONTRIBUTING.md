# Contributing

Thanks for helping improve the Pool Season Tracker. This guide explains how the code is organized and the conventions to follow when adding or refactoring features.

## Architecture and Separation of Concerns

- Hooks (src/hooks)
  - Data subscriptions/fetching (Firestore listeners) and business actions.
  - Prefer one hook per concern (e.g., `useGames`, `useGameById`, `useSeasonActions`).
  - Return simple shapes (`{ data, loading, error }` or `{ ok, error? }`) so components stay dumb.

- Utils (src/utils)
  - Pure, stateless helpers (date formatting, game classification/sorting, status labels, stats math, fixtures normalization).
  - No React/DOM imports here.

- Components (src/components)
  - Presentational, reusable pieces with typed props (`Props` interfaces).
  - Keep components small; compose where necessary (e.g., `MatchCard` + `MatchInlineEdit`).

- Pages (src/pages)
  - Compose hooks and components. Avoid inline Firestore calls or complex logic in pages.
  - If a page grows beyond ~300 lines, split by extracting components or dedicated hooks.

## Styling

- Prefer Chakra props over inline styles (e.g., `mt`, `gap`, `wrap`, `colorScheme`).
- Use the existing tag classes only where Chakra equivalents are not yet in place (migration is OK over time).
- Keep responsive behavior with Chakra responsive props (e.g., `{ base: 'column', sm: 'row' }`).

## State and Persistence

- Use `usePersistentState` for simple localStorage persistence (tab filters, view modes).
- Keep component state minimal; push logic into hooks and utils where possible.

## Firestore Patterns

- Read/subscribe via hooks: `useGames`, `useGameById`, `useUserProfileByUid`, `useUserProfilesOptions`.
- Mutations/business rules via `useSeasonActions`:
  - `updateResult` enforces season-cap checks.
  - `importFixtures` normalizes and writes idempotently.
  - `savePlayerStats` runs a transaction to update game stats and roll up profile totals.
- Prefer returning `{ ok, error }` from actions; pages show the message via toasts/inline errors.

## Code Style

- TypeScript: avoid `any`. Type props (`Props`) and hook returns.
- Naming: `useX` for hooks, `XCard`/`XPanel` for presentational components, `formatX/computeX` for utilities.
- Keep functions pure and small; extract helpers if a function exceeds ~30–40 lines of complex logic.
- Reuse shared helpers: `formatMatchDateLabel`, `classifyMatch`, `sortByPrevious`, `getResultLabel`, `clamp`, etc.

## Commit/PR Checklist

- Does this belong in a hook, util, or component instead of inline?
- Are props and hook returns typed clearly?
- Are Chakra props used instead of inline styles?
- Are errors surfaced to the user (return `{ ok, error }` from actions and display)?
- Does `npm run build` succeed locally (TypeScript passes)?

## Local Dev

- Install deps: `npm install`
- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`

## Admin/Manager Tools

- Import fixtures in-app via Season Manager (manager only).
- Seed fixtures via `npm run seed:games` with a service account (see README for details).

If you’re unsure where something should live, prefer a hook or util first; you can always compose more granular components later. Keep pages thin and logic testable.

