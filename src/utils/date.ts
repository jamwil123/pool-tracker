import type { Timestamp } from 'firebase/firestore'

const isTimestamp = (v: any): v is Timestamp => !!v && typeof v.toDate === 'function'

export const parseNotesDate = (notes?: string | null): Date | null => {
  if (typeof notes !== 'string') return null
  const t = notes.trim()
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

export const formatMatchDateLabel = (
  matchDate: any,
  notes?: string | null,
  tbcLabel: string = 'Date TBC',
): string => {
  try {
    if (isTimestamp(matchDate)) return matchDate.toDate().toLocaleDateString()
    if (matchDate instanceof Date) return matchDate.toLocaleDateString()
    const fromNotes = parseNotesDate(notes || null)
    if (fromNotes) return fromNotes.toLocaleDateString()
    if (typeof notes === 'string' && notes.trim()) return notes.trim()
    return tbcLabel
  } catch {
    return tbcLabel
  }
}

export default formatMatchDateLabel

