import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScanPanel } from './ScanPanel.tsx'
import { validateImageFile } from '../lib/vision/image.ts'
import { __clearSignedCoverCache } from '../media/signedCover.ts'
import { RecognitionError, type CoverRecognition } from '../lib/vision/types.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

const recognizeCover = vi.fn()
const searchCatalog = vi.fn()
const addCatalog = vi.fn()

vi.mock('../lib/vision/client.ts', () => ({
  recognizeCover: (...a: unknown[]) => recognizeCover(...a),
}))
vi.mock('../lib/vision/image.ts', async (o) => ({
  ...(await o<typeof import('../lib/vision/image.ts')>()),
  downscaleImageToDataUrl: vi.fn(async () => 'data:image/webp;base64,AAAA'),
  validateImageFile: vi.fn(),
}))
vi.mock('../lib/catalog/client.ts', () => ({
  searchCatalog: (...a: unknown[]) => searchCatalog(...a),
  addCatalogReleaseToCollection: (...a: unknown[]) => addCatalog(...a),
}))

afterEach(() => {
  vi.clearAllMocks()
  __clearSignedCoverCache()
})

function recognition(over: Partial<CoverRecognition> = {}): CoverRecognition {
  return {
    artist: 'Aphex Twin',
    albumTitle: 'Selected Ambient Works 85-92',
    visibleText: [],
    label: null,
    catalogNumber: null,
    releaseYearHint: 1992,
    confidence: 0.9,
    notes: null,
    identified: true,
    ...over,
  }
}

function candidate(over: Partial<CatalogCandidate> = {}): CatalogCandidate {
  return {
    artist: 'Aphex Twin',
    title: 'Selected Ambient Works 85-92',
    provider: 'musicbrainz',
    providerReleaseId: '11111111-1111-4111-8111-111111111111',
    providerReleaseGroupId: null,
    releaseYear: 1992,
    label: 'R&S',
    catalogNumber: null,
    country: 'BE',
    format: 'CD',
    score: 99,
    transientCoverDisplayUrl: null,
    derivedProviderPageUrl: 'https://musicbrainz.org/release/1',
    ...over,
  }
}

function setup() {
  const onCollectionChanged = vi.fn()
  const onSearchByText = vi.fn()
  render(
    <ScanPanel
      client={{} as BrowserSupabaseClient}
      userId="uid"
      onCollectionChanged={onCollectionChanged}
      onSearchByText={onSearchByText}
    />,
  )
  return { onCollectionChanged, onSearchByText }
}

async function selectFileAndAnalyse() {
  const user = userEvent.setup()
  await user.upload(
    document.querySelector('input[type=file]') as HTMLInputElement,
    new File(['x'], 'cover.png', { type: 'image/png' }),
  )
  await user.click(screen.getByRole('button', { name: 'Analyse cover' }))
}

describe('ScanPanel', () => {
  it('analysing and catalogue-searching are distinct phases', async () => {
    let resolveRec: (v: CoverRecognition) => void = () => {}
    recognizeCover.mockImplementation(() => new Promise((r) => (resolveRec = r)))
    let resolveSearch: (v: CatalogCandidate[]) => void = () => {}
    searchCatalog.mockImplementation(() => new Promise((r) => (resolveSearch = r)))

    setup()
    await selectFileAndAnalyse()
    expect(await screen.findByText('Reading the cover…')).toBeInTheDocument()

    resolveRec(recognition())
    expect(await screen.findByText('Searching the catalogue…')).toBeInTheDocument()

    resolveSearch([candidate()])
    expect(await screen.findByText('Selected Ambient Works 85-92')).toBeInTheDocument()
  })

  it('a candidate is only added on an explicit confirm', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate(), candidate({ providerReleaseId: '2', country: 'US' })])
    addCatalog.mockResolvedValue({})
    const { onCollectionChanged } = setup()
    await selectFileAndAnalyse()

    await screen.findByRole('list', { name: 'Catalogue candidates' })
    expect(addCatalog).not.toHaveBeenCalled()

    await userEvent
      .setup()
      .click(screen.getAllByRole('button', { name: 'This is it — add' })[0])
    await waitFor(() => expect(addCatalog).toHaveBeenCalledTimes(1))
    expect(onCollectionChanged).toHaveBeenCalled()
    expect(await screen.findByText('Added to your collection.')).toBeInTheDocument()
  })

  it('no catalogue match is shown as no-match with fallbacks', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([])
    setup()
    await selectFileAndAnalyse()
    expect(
      await screen.findByText('No catalogue release matched those clues.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Refine the search in Discover' }),
    ).toBeInTheDocument()
  })

  it('a catalogue provider failure is an error, not "no match"', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockRejectedValue(new Error('MusicBrainz timeout'))
    setup()
    await selectFileAndAnalyse()
    expect(await screen.findByText('MusicBrainz timeout')).toBeInTheDocument()
    expect(
      screen.queryByText('No catalogue release matched those clues.'),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Retry catalogue search' }),
    ).toBeInTheDocument()
  })

  it('retrying a provider error re-runs the catalogue search but NOT Vision', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog
      .mockRejectedValueOnce(new Error('MusicBrainz timeout'))
      .mockResolvedValueOnce([candidate()])
    setup()
    await selectFileAndAnalyse()

    expect(recognizeCover).toHaveBeenCalledTimes(1)
    expect(searchCatalog).toHaveBeenCalledTimes(1)

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry catalogue search' }))

    // catalogue searched again ...
    await waitFor(() => expect(searchCatalog).toHaveBeenCalledTimes(2))
    // ... but the photo was NOT re-recognised
    expect(recognizeCover).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText('Selected Ambient Works 85-92'),
    ).toBeInTheDocument()
  })

  it('a recognition/model failure is a model error, not "no match"', async () => {
    recognizeCover.mockRejectedValue(
      new RecognitionError('provider_unavailable', 'The recognition service is down.'),
    )
    setup()
    await selectFileAndAnalyse()
    expect(
      await screen.findByText('The recognition service is down.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/No catalogue release matched/)).toBeNull()
  })

  it('a low-confidence read offers text search + manual, never a silent save', async () => {
    recognizeCover.mockResolvedValue(recognition({ identified: false, artist: null, albumTitle: null }))
    const { onSearchByText } = setup()
    await selectFileAndAnalyse()
    expect(
      await screen.findByText('VIN could not read enough from that photo to be sure.'),
    ).toBeInTheDocument()
    expect(addCatalog).not.toHaveBeenCalled()
    expect(searchCatalog).not.toHaveBeenCalled()
    expect(onSearchByText).not.toHaveBeenCalled()
  })

  describe('drag & drop', () => {
    function dropZone() {
      return document.querySelector('.vi-scan__drop') as HTMLElement
    }
    const png = () => new File(['x'], 'cover.png', { type: 'image/png' })

    it('shows a drag-over state that clears on leave', () => {
      setup()
      const zone = dropZone()
      fireEvent.dragOver(zone, { dataTransfer: { types: ['Files'] } })
      expect(screen.getByText('Drop the cover here')).toBeInTheDocument()
      fireEvent.dragLeave(zone, { target: zone })
      expect(screen.queryByText('Drop the cover here')).toBeNull()
    })

    it('dropping a valid image selects it through the normal validation path', () => {
      vi.mocked(validateImageFile).mockImplementation(() => {})
      setup()
      fireEvent.drop(dropZone(), {
        dataTransfer: { files: [png()], types: ['Files'] },
      })
      expect(validateImageFile).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Selected: cover.png')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Analyse cover' })).toBeInTheDocument()
    })

    it('dropping an invalid file enters the existing validation error state', () => {
      vi.mocked(validateImageFile).mockImplementation(() => {
        throw new RecognitionError('image_too_large', 'That image is too large.')
      })
      setup()
      fireEvent.drop(dropZone(), {
        dataTransfer: { files: [png()], types: ['Files'] },
      })
      expect(screen.getByRole('alert')).toHaveTextContent('That image is too large.')
      expect(screen.queryByRole('button', { name: 'Analyse cover' })).toBeNull()
    })

    it('a selected image can be replaced or removed before analysis', async () => {
      vi.mocked(validateImageFile).mockImplementation(() => {})
      setup()
      fireEvent.drop(dropZone(), {
        dataTransfer: { files: [png()], types: ['Files'] },
      })
      // the picker affordance switches to "Replace image"
      expect(screen.getByText('Replace image')).toBeInTheDocument()

      await userEvent.setup().click(screen.getByRole('button', { name: 'Remove image' }))
      expect(screen.queryByText('Selected: cover.png')).toBeNull()
      expect(screen.getByText('Choose image')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Analyse cover' })).toBeNull()
    })
  })
})
