// JSX only; no React import needed in modern setups
import { Box, Heading, Text, HStack, Button } from '@chakra-ui/react'
import type { SeasonGameDocument } from '../types/models'
import { getResultLabel, getResultTagClass } from '../utils/status'

export type SeasonGame = SeasonGameDocument & { id: string }

type Props = {
  game: SeasonGame
  dateLabel: string
  canManage: boolean
  canSetResult: boolean
  deleting: boolean
  isEditing: boolean
  onMarkWin: () => void
  onMarkLoss: () => void
  onEdit: () => void
  onDelete: () => void
}

const MatchCard = ({ game, dateLabel, canManage, canSetResult, deleting, isEditing, onMarkWin, onMarkLoss, onEdit, onDelete }: Props) => {
  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p={4}
      bg="white"
      boxShadow="sm"
      _hover={{ boxShadow: 'md', transform: 'translateY(-2px)' }}
      role="button"
    >
      <HStack justify="space-between" align="start">
        <Box>
          <Heading as="h3" size="sm" mb={1}>{game.opponent}</Heading>
          <Text color="gray.600">{dateLabel} · {game.location || 'Location TBC'}</Text>
        </Box>
        <Box className={`tag ${getResultTagClass(game.result)}`}>
          {getResultLabel(game.result)}
        </Box>
      </HStack>
      <Text mt={2} color="gray.700">{game.homeOrAway === 'home' ? 'Home' : 'Away'} fixture</Text>
      {canManage ? (
        <HStack mt={3} gap={2} wrap="wrap">
          <Button
            size={{ base: 'xs', sm: 'sm' }}
            onClick={(e) => { e.preventDefault(); if (canSetResult) onMarkWin() }}
            disabled={!canSetResult}
            title={canSetResult ? '' : 'Results can be set on or after match day'}
          >
            Mark Win
          </Button>
          <Button
            size={{ base: 'xs', sm: 'sm' }}
            variant="outline"
            onClick={(e) => { e.preventDefault(); if (canSetResult) onMarkLoss() }}
            disabled={!canSetResult}
            title={canSetResult ? '' : 'Results can be set on or after match day'}
          >
            Mark Loss
          </Button>
          <Button size={{ base: 'xs', sm: 'sm' }} variant="ghost" onClick={(e) => { e.preventDefault(); onEdit() }}>{isEditing ? 'Close' : 'Edit'}</Button>
          <Button
            size={{ base: 'xs', sm: 'sm' }}
            colorScheme="red"
            variant="outline"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete() }}
            loading={deleting}
          >
            Delete
          </Button>
        </HStack>
      ) : null}
    </Box>
  )
}

export default MatchCard
