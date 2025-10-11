export const clamp = (value: number, max: number) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, n))
}

export type TeamTotals = { sW: number; sL: number; dW: number; dL: number }

export const computeTeamTotals = (rows: Array<{ singlesWins: number; singlesLosses: number; doublesWins: number; doublesLosses: number }>): TeamTotals => {
  return rows.reduce(
    (acc, r) => ({
      sW: acc.sW + (Number(r.singlesWins) || 0),
      sL: acc.sL + (Number(r.singlesLosses) || 0),
      dW: acc.dW + (Number(r.doublesWins) || 0),
      dL: acc.dL + (Number(r.doublesLosses) || 0),
    }),
    { sW: 0, sL: 0, dW: 0, dL: 0 },
  )
}

