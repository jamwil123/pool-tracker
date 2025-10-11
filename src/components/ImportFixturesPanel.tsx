import { Box, Button, HStack, Text } from '@chakra-ui/react'

type Props = {
  open: boolean
  importText: string
  setImportText: (v: string) => void
  importing: boolean
  importMessage: string | null
  onImport: () => void
  onToggle: () => void
}

const ImportFixturesPanel = ({ open, importText, setImportText, importing, importMessage, onImport, onToggle }: Props) => {
  return (
    <Box className="importer" mb={4}>
      <Button type="button" onClick={onToggle} className="secondary-button">
        {open ? 'Close Import Fixtures' : 'Import Fixtures'}
      </Button>
      {open ? (
        <Box mt={2}>
          <Text className="hint">Paste the fixtures JSON below and click Import. Your current sign-in will be used; no service account needed.</Text>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={10}
            style={{ width: '100%', marginTop: 8 }}
          />
          <HStack className="actions" mt={2}>
            <Button type="button" onClick={onImport} disabled={importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </HStack>
          {importMessage ? (
            <Text color={importMessage.startsWith('Import failed') ? 'red.500' : 'gray.600'} mt={1}>{importMessage}</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  )
}

export default ImportFixturesPanel

