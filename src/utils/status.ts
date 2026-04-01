export type GameResult = 'pending' | 'win' | 'loss' | 'conceded' | string | null | undefined

export const getResultLabel = (result: GameResult): string => {
  if (result === 'win') return 'Win'
  if (result === 'loss') return 'Loss'
  if (result === 'conceded') return 'Conceded'
  return 'Pending'
}

export const getResultTagClass = (result: GameResult): string => {
  const key = result === 'win' || result === 'loss' ? result : result === 'conceded' ? 'conceded' : 'pending'
  return `status-${key}`
}

export default getResultLabel
