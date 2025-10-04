import type { FieldValue, Timestamp } from 'firebase/firestore'

export type Role = 'captain' | 'viceCaptain' | 'player'

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
