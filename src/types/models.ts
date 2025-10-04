import type { FieldValue, Timestamp } from 'firebase/firestore'

// Single source of truth for roles
export const ROLES = ['captain', 'viceCaptain', 'player'] as const
export type Role = typeof ROLES[number]
export const isRole = (v: unknown): v is Role =>
  typeof v === 'string' && (ROLES as readonly string[]).includes(v)

export const MANAGER_ROLES = ['captain', 'viceCaptain'] as const
export type ManagerRole = typeof MANAGER_ROLES[number]
export const isManagerRole = (v: unknown): v is ManagerRole =>
  typeof v === 'string' && (MANAGER_ROLES as readonly string[]).includes(v)

export type UserProfileDocument = {
  displayName: string
  role: Role
  uid?: string | null
  linkedRosterId: string
  linkedPlayerId: string | null
  totalWins: number
  totalLosses: number
  subsStatus: 'paid' | 'due'
  createdAt: Timestamp | FieldValue | null
  updatedAt: Timestamp | FieldValue | null
}

export type RosterDocument = {
  displayName: string
  role: Role
  assignedUid: string | null
  assignedEmail: string | null
  assignedAt: Timestamp | FieldValue | null
  createdAt: Timestamp | FieldValue | null
  linkedProfileUid: string | null
}

export type PlayerDocument = {
  displayName: string
  wins: number
  losses: number
  subsStatus: 'paid' | 'due'
  createdAt: Timestamp | FieldValue | null
  updatedAt?: Timestamp | FieldValue | null
  subsUpdatedAt?: Timestamp | FieldValue | null
  linkedProfileUid: string | null
}

export type SeasonGamePlayerStat = {
  playerId: string
  displayName: string
  singlesWins: number
  singlesLosses: number
  doublesWins: number
  doublesLosses: number
  subsPaid?: boolean
}

export type SeasonGameDocument = {
  opponent: string
  matchDate: Timestamp | null
  location: string
  homeOrAway: 'home' | 'away'
  players: string[]
  playerStats: SeasonGamePlayerStat[]
  result: 'win' | 'loss' | 'pending'
  notes: string | null
  createdAt: Timestamp | FieldValue | null
  updatedAt?: Timestamp | FieldValue | null
}
