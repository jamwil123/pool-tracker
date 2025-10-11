import { HStack, Button } from '@chakra-ui/react'

type Mode = 'all' | 'singles' | 'doubles'

type Props = {
  value: Mode
  onChange: (mode: Mode) => void
  size?: 'xs' | 'sm'
}

const ModeToggle = ({ value, onChange, size = 'xs' }: Props) => {
  return (
    <HStack gap={2} style={{ flexWrap: 'wrap' }}>
      <Button size={size} colorScheme="blue" variant={value === 'all' ? 'solid' : 'outline'} onClick={() => onChange('all')}>All</Button>
      <Button size={size} colorScheme="cyan" variant={value === 'singles' ? 'solid' : 'outline'} onClick={() => onChange('singles')}>Singles</Button>
      <Button size={size} colorScheme="purple" variant={value === 'doubles' ? 'solid' : 'outline'} onClick={() => onChange('doubles')}>Doubles</Button>
    </HStack>
  )
}

export default ModeToggle

