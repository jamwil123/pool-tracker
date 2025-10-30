import React from 'react'
import { Box, Text, Input, HStack, Button } from '@chakra-ui/react'

type Value = {
  opponent: string
  matchDate: string
  location: string
  homeOrAway: 'home' | 'away'
}

type Props = {
  value: Value
  notes: string
  onFieldChange: (field: keyof Value, value: string) => void
  onNotesChange: (value: string) => void
  submitting: boolean
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}

const MatchInlineEdit = ({ value, notes, onFieldChange, onNotesChange, submitting, onSubmit, onCancel }: Props) => {
  return (
    <Box mt={3} borderWidth="1px" borderRadius="md" p={3} bg="white">
      <form onSubmit={onSubmit}>
        <HStack gap={2} wrap="wrap">
          <Box flex="1 1 220px">
            <Text fontSize="sm" mb={1}>Team Name</Text>
            <Input value={value.opponent} onChange={(e) => onFieldChange('opponent', e.target.value)} required />
          </Box>
          <Box flex="1 1 160px">
            <Text fontSize="sm" mb={1}>Match Date</Text>
            <Input type="date" value={value.matchDate} onChange={(e) => onFieldChange('matchDate', e.target.value)} />
          </Box>
          <Box flex="1 1 180px">
            <Text fontSize="sm" mb={1}>Location</Text>
            <Input value={value.location} onChange={(e) => onFieldChange('location', e.target.value)} />
          </Box>
          <Box flex="0 1 140px">
            <Text fontSize="sm" mb={1}>Home/Away</Text>
            <select value={value.homeOrAway} onChange={(e) => onFieldChange('homeOrAway', e.target.value)}>
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </Box>
          <Box flex="1 1 100%">
            <Text fontSize="sm" mb={1}>Notes</Text>
            <Input value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Optional notes" />
          </Box>
        </HStack>
        <HStack mt={3}>
          <Button type="submit" colorScheme="blue" loading={submitting} loadingText="Saving">
            Save
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </HStack>
      </form>
    </Box>
  )
}

export default MatchInlineEdit
