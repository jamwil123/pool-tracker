export type GameResult = 'pending' | 'win' | 'loss' | string | null | undefined

export const getResultLabel = (result: GameResult): string => {
  return result === 'win' ? 'Win' : result === 'loss' ? 'Loss' : 'Pending'
}

export const getResultTagClass = (result: GameResult): string => {
  const key = result === 'win' || result === 'loss' ? result : 'pending'
  return `status-${key}`
}

export default getResultLabel

