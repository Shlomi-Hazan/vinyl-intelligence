import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScanPanel } from './ScanPanel.tsx'
import { validateImageFile } from '../lib/vision/image.ts'
import { __clearSignedCoverCache } from '../media/signedCover.ts'
import { RecognitionError, type CoverRecognition } from '../lib/vision/types.ts'
import type { LoadPhase } from '../app/collection-data-context.ts'
import type { CatalogCandidate } from '../lib/catalog/types.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'
import { textIgnoringBidi } from '../test/i18n.ts'

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

function ownedItem(
  over: Partial<CollectionItemWithRelease['release']> = {},
): CollectionItemWithRelease {
  return {
    id: 'c1',
    added_at: '',
    created_at: '',
    rating: null,
    is_favorite: false,
    notes: null,
    release: {
      id: 'r1',
      artist: 'Aphex Twin',
      title: 'Selected Ambient Works 85-92',
      release_year: 1992,
      label: null,
      catalog_number: null,
      country: null,
      format: null,
      genres: [],
      updated_at: '',
      provider: 'musicbrainz',
      provider_release_id: '11111111-1111-4111-8111-111111111111',
      ...over,
    },
  } as CollectionItemWithRelease
}

function setup(
  ownedItems: CollectionItemWithRelease[] = [],
  collectionStatus: LoadPhase = 'ready',
) {
  const onCollectionChanged = vi.fn()
  const onSearchByText = vi.fn()
  const view = render(
    <ScanPanel
      client={{} as BrowserSupabaseClient}
      userId="uid"
      ownedItems={ownedItems}
      collectionStatus={collectionStatus}
      onCollectionChanged={onCollectionChanged}
      onSearchByText={onSearchByText}
    />,
  )
  return { onCollectionChanged, onSearchByText, ...view }
}

async function selectFileAndAnalyse() {
  const user = userEvent.setup()
  await user.upload(
    document.querySelector('input[type=file]') as HTMLInputElement,
    new File(['x'], 'cover.png', { type: 'image/png' }),
  )
  await user.click(screen.getByRole('button', { name: 'Analyse cover' }))
}

describe('ScanPanel - Hebrew & multilingual (spec 0015)', () => {
  it('renders a Hebrew recognition clue and a Hebrew candidate with isolation', async () => {
    recognizeCover.mockResolvedValue(
      recognition({ artist: 'שלום חנוך', albumTitle: 'מחכים למשיח' }),
    )
    searchCatalog.mockResolvedValue([
      candidate({ artist: 'שלום חנוך', title: 'מחכים למשיח' }),
    ])
    setup()
    await selectFileAndAnalyse()

    // the candidate title is a Hebrew-isolated <bdi>
    const candTitle = await screen.findByText('מחכים למשיח')
    expect(candTitle.tagName).toBe('BDI')
    expect(candTitle.getAttribute('lang')).toBe('he')

    // the "Artist:" clue chip keeps its English label and contains the Hebrew
    // value bracketed by bidi isolate controls (invisible U+2068 / U+2069).
    const clue = screen
      .getAllByText((_c, el) => el?.className === 'vi-scan__clue')
      .find((el) => el.textContent?.includes('Artist:'))
    expect(clue?.textContent).toContain('שלום חנוך')
    expect(clue?.textContent).toContain(String.fromCodePoint(0x2068))
  })

  it('isolates a Hebrew candidate artist separately from its Latin title (no composite leakage)', async () => {
    recognizeCover.mockResolvedValue(recognition({ artist: 'שלום חנוך' }))
    searchCatalog.mockResolvedValue([
      candidate({ artist: 'שלום חנוך', title: 'Greatest Hits' }),
    ])
    setup()
    await selectFileAndAnalyse()

    const candArtist = await screen.findByText('שלום חנוך')
    expect(candArtist.tagName).toBe('BDI')
    expect(candArtist.getAttribute('lang')).toBe('he')

    const candTitle = await screen.findByText('Greatest Hits')
    expect(candTitle.tagName).toBe('BDI')
    // Latin-only title never gets lang="he", and it is a SEPARATE <bdi> from
    // the Hebrew artist - one field's script never determines the other's.
    expect(candTitle.getAttribute('lang')).toBeNull()
    expect(candTitle).not.toBe(candArtist)
  })

  it('a Latin/English candidate is unaffected by the Hebrew isolation path', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    setup()
    await selectFileAndAnalyse()

    const candTitle = await screen.findByText('Selected Ambient Works 85-92')
    expect(candTitle.tagName).toBe('BDI')
    expect(candTitle.getAttribute('lang')).toBeNull()
    const candArtist = await screen.findByText('Aphex Twin')
    expect(candArtist.getAttribute('lang')).toBeNull()
  })
})

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

  it('the existing per-candidate MusicBrainz link announces "(opens in a new tab)" (spec 0017 §19)', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    setup()
    await selectFileAndAnalyse()

    const link = await screen.findByRole('link', { name: /^MusicBrainz.*opens in a new tab/ })
    expect(link).toHaveAttribute('href', candidate().derivedProviderPageUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
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
      expect(screen.getByText(textIgnoringBidi('Selected: cover.png'))).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Analyse cover' })).toBeInTheDocument()
    })

    it('isolates a Hebrew selected filename (PR #26 correction)', () => {
      vi.mocked(validateImageFile).mockImplementation(() => {})
      setup()
      const hebrewFile = new File(['x'], 'מחכים למשיח.jpg', { type: 'image/jpeg' })
      fireEvent.drop(dropZone(), {
        dataTransfer: { files: [hebrewFile], types: ['Files'] },
      })
      const selected = screen.getByText(textIgnoringBidi('Selected: מחכים למשיח.jpg'))
      const FSI = String.fromCodePoint(0x2068)
      const PDI = String.fromCodePoint(0x2069)
      expect(selected.textContent).toBe(`Selected: ${FSI}מחכים למשיח.jpg${PDI}`)
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

describe('ScanPanel - duplicate-copy confirmation (spec 0016 Finding B)', () => {
  const DIALOG_MESSAGE =
    'You already own this release. Add another physical copy to your collection?'

  it('a not-owned candidate keeps the ordinary "This is it — add" behavior, with no duplicate dialog', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    addCatalog.mockResolvedValue({})
    const { onCollectionChanged } = setup([])
    await selectFileAndAnalyse()

    expect(screen.queryByText(DIALOG_MESSAGE)).toBeNull()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'This is it — add' }))
    await waitFor(() => expect(addCatalog).toHaveBeenCalledTimes(1))
    expect(onCollectionChanged).toHaveBeenCalled()
    expect(await screen.findByText('Added to your collection.')).toBeInTheDocument()
  })

  it('an owned candidate shows both the honest indicator and "Add another copy"', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    setup([ownedItem()])
    await selectFileAndAnalyse()

    expect(await screen.findByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'This is it — add' })).toBeNull()
  })

  it('clicking "Add another copy" then Cancel makes zero add calls and remains on candidate selection', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    const { onCollectionChanged } = setup([ownedItem()])
    const user = userEvent.setup()
    await selectFileAndAnalyse()

    await user.click(await screen.findByRole('button', { name: 'Add another copy' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(DIALOG_MESSAGE)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(addCatalog).not.toHaveBeenCalled()
    expect(onCollectionChanged).not.toHaveBeenCalled()
    // still recoverable: remains on the candidate list, owned presentation intact
    expect(screen.getByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
  })

  it('confirming "Add another copy" makes exactly one add call for the correct candidate and reaches the normal success state', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    addCatalog.mockResolvedValue({})
    const { onCollectionChanged } = setup([ownedItem()])
    const user = userEvent.setup()
    await selectFileAndAnalyse()

    await user.click(await screen.findByRole('button', { name: 'Add another copy' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Add another copy' }))

    await waitFor(() => expect(addCatalog).toHaveBeenCalledTimes(1))
    expect(addCatalog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerReleaseId: candidate().providerReleaseId }),
    )
    expect(onCollectionChanged).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('Added to your collection.')).toBeInTheDocument()
  })

  it('a rapid/repeated confirmation cannot create a second add request - the outer action disables while pending', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    let resolveAdd: (v: unknown) => void = () => {}
    addCatalog.mockImplementation(() => new Promise((r) => (resolveAdd = r)))
    setup([ownedItem()])
    const user = userEvent.setup()
    await selectFileAndAnalyse()

    // first confirm starts exactly one request and closes the dialog
    await user.click(screen.getByRole('button', { name: 'Add another copy' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Add another copy' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(addCatalog).toHaveBeenCalledTimes(1))

    // while pending, the outer duplicate action is disabled / non-actionable
    const pendingButton = screen.getByRole('button', { name: 'Adding…' })
    expect(pendingButton).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add another copy' })).toBeNull()
    await user.click(pendingButton)
    expect(screen.queryByRole('dialog')).toBeNull()

    resolveAdd({})
    await waitFor(() => expect(addCatalog).toHaveBeenCalledTimes(1))
  })

  it('a failed duplicate add uses the existing Scan add-error presentation and remains recoverable', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    addCatalog.mockRejectedValue(new Error('Could not add that copy.'))
    setup([ownedItem()])
    const user = userEvent.setup()
    await selectFileAndAnalyse()

    await user.click(await screen.findByRole('button', { name: 'Add another copy' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Add another copy' }))

    expect(await screen.findByText('Could not add that copy.')).toBeInTheDocument()
    // recoverable: still on the candidate list, owned presentation intact
    expect(screen.getByText('In your collection')).toBeInTheDocument()
    const retryButton = screen.getByRole('button', { name: 'Add another copy' })
    expect(retryButton).toBeInTheDocument()

    // retry works by reopening the dialog and confirming again
    addCatalog.mockResolvedValue({})
    await user.click(retryButton)
    const dialog2 = await screen.findByRole('dialog')
    await user.click(within(dialog2).getByRole('button', { name: 'Add another copy' }))
    await waitFor(() => expect(addCatalog).toHaveBeenCalledTimes(2))
  })

  it('an owned Hebrew candidate keeps the existing Bidi rendering with the duplicate UI present', async () => {
    recognizeCover.mockResolvedValue(
      recognition({ artist: 'שלום חנוך', albumTitle: 'מחכים למשיח' }),
    )
    searchCatalog.mockResolvedValue([
      candidate({ artist: 'שלום חנוך', title: 'מחכים למשיח' }),
    ])
    setup([ownedItem({ artist: 'שלום חנוך', title: 'מחכים למשיח' })])
    await selectFileAndAnalyse()

    const title = await screen.findByText('מחכים למשיח')
    expect(title.tagName).toBe('BDI')
    expect(title.getAttribute('lang')).toBe('he')
    expect(screen.getByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
  })
})

describe('ScanPanel - ownership gated on authoritative collection-load status (spec 0016 Finding B review correction)', () => {
  it('never exposes an enabled catalog-add path while collection data is loading', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    setup([], 'loading')
    await selectFileAndAnalyse()

    const placeholder = await screen.findByRole('button', { name: 'Checking collection…' })
    expect(placeholder).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'This is it — add' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add another copy' })).toBeNull()
    expect(screen.queryByText('In your collection')).toBeNull()
    expect(addCatalog).not.toHaveBeenCalled()
  })

  it('never exposes an enabled catalog-add path while collection data errored', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    setup([], 'error')
    await selectFileAndAnalyse()

    const placeholder = await screen.findByRole('button', { name: 'Collection unavailable' })
    expect(placeholder).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'This is it — add' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add another copy' })).toBeNull()
    expect(screen.queryByText('In your collection')).toBeNull()
    expect(addCatalog).not.toHaveBeenCalled()
  })

  it('loading -> ready, NOT owned - resolves to the normal enabled add action', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    const { rerender } = setup([], 'loading')
    await selectFileAndAnalyse()
    await screen.findByRole('button', { name: 'Checking collection…' })

    rerender(
      <ScanPanel
        client={{} as BrowserSupabaseClient}
        userId="uid"
        ownedItems={[]}
        collectionStatus="ready"
        onCollectionChanged={vi.fn()}
        onSearchByText={vi.fn()}
      />,
    )
    expect(
      await screen.findByRole('button', { name: 'This is it — add' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Checking collection…' })).toBeNull()
  })

  it('loading -> ready, OWNED - resolves to the honest indicator and "Add another copy"', async () => {
    recognizeCover.mockResolvedValue(recognition())
    searchCatalog.mockResolvedValue([candidate()])
    const { rerender } = setup([], 'loading')
    await selectFileAndAnalyse()
    await screen.findByRole('button', { name: 'Checking collection…' })

    rerender(
      <ScanPanel
        client={{} as BrowserSupabaseClient}
        userId="uid"
        ownedItems={[ownedItem()]}
        collectionStatus="ready"
        onCollectionChanged={vi.fn()}
        onSearchByText={vi.fn()}
      />,
    )
    expect(await screen.findByText('In your collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add another copy' })).toBeInTheDocument()
  })
})
