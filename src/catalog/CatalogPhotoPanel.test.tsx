import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogPhotoPanel } from './CatalogPhotoPanel.tsx'
import { recognizeCover } from '../lib/vision/client.ts'
import { downscaleImageToDataUrl, validateImageFile } from '../lib/vision/image.ts'
import { RecognitionError, type CoverRecognition } from '../lib/vision/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

vi.mock('../lib/vision/client.ts', () => ({ recognizeCover: vi.fn() }))
vi.mock('../lib/vision/image.ts', () => ({
  downscaleImageToDataUrl: vi.fn(),
  validateImageFile: vi.fn(),
}))

const client = {} as BrowserSupabaseClient

function recognition(overrides: Partial<CoverRecognition> = {}): CoverRecognition {
  return {
    artist: 'Pink Floyd',
    albumTitle: 'The Dark Side of the Moon',
    visibleText: ['PINK FLOYD'],
    label: 'Harvest',
    catalogNumber: null,
    releaseYearHint: 1973,
    confidence: 0.85,
    notes: null,
    identified: true,
    ...overrides,
  }
}

function jpegFile() {
  return new File([new Uint8Array(2048)], 'cover.jpg', { type: 'image/jpeg' })
}

describe('CatalogPhotoPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(validateImageFile).mockReturnValue(undefined)
    vi.mocked(downscaleImageToDataUrl).mockResolvedValue('data:image/jpeg;base64,AAAA')
    vi.mocked(recognizeCover).mockResolvedValue(recognition())
  })

  it('renders the file input with recognition disabled until a file is chosen', () => {
    render(<CatalogPhotoPanel client={client} onUseQuery={vi.fn()} />)

    expect(screen.getByLabelText('Cover photo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recognize cover' })).toBeDisabled()
    expect(recognizeCover).not.toHaveBeenCalled()
  })

  it('recognizes a chosen cover and shows editable clues', async () => {
    const user = userEvent.setup()
    render(<CatalogPhotoPanel client={client} onUseQuery={vi.fn()} />)

    await user.upload(screen.getByLabelText('Cover photo'), jpegFile())
    await user.click(screen.getByRole('button', { name: 'Recognize cover' }))

    expect(await screen.findByText('Artist: Pink Floyd')).toBeInTheDocument()
    expect(downscaleImageToDataUrl).toHaveBeenCalledOnce()
    expect(recognizeCover).toHaveBeenCalledOnce()

    const queryInput = screen.getByLabelText('Search from these clues')
    expect(queryInput).toHaveValue('Pink Floyd The Dark Side of the Moon')
  })

  it('passes the edited query to onUseQuery', async () => {
    const user = userEvent.setup()
    const onUseQuery = vi.fn()
    render(<CatalogPhotoPanel client={client} onUseQuery={onUseQuery} />)

    await user.upload(screen.getByLabelText('Cover photo'), jpegFile())
    await user.click(screen.getByRole('button', { name: 'Recognize cover' }))
    await screen.findByText('Artist: Pink Floyd')

    const queryInput = screen.getByLabelText('Search from these clues')
    await user.clear(queryInput)
    await user.type(queryInput, 'Pink Floyd Dark Side')
    await user.click(screen.getByRole('button', { name: 'Search catalog for these clues' }))

    expect(onUseQuery).toHaveBeenCalledWith('Pink Floyd Dark Side')
  })

  it('locks the recognize button while a recognition is in flight', async () => {
    const user = userEvent.setup()
    let resolveDownscale: ((value: string) => void) | undefined
    vi.mocked(downscaleImageToDataUrl).mockImplementation(
      () => new Promise((resolve) => {
        resolveDownscale = resolve
      }),
    )

    render(<CatalogPhotoPanel client={client} onUseQuery={vi.fn()} />)
    await user.upload(screen.getByLabelText('Cover photo'), jpegFile())
    await user.click(screen.getByRole('button', { name: 'Recognize cover' }))

    const busyButton = screen.getByRole('button', { name: 'Recognizing...' })
    expect(busyButton).toBeDisabled()

    resolveDownscale?.('data:image/jpeg;base64,AAAA')
    await screen.findByText('Artist: Pink Floyd')
    expect(recognizeCover).toHaveBeenCalledOnce()
    expect(downscaleImageToDataUrl).toHaveBeenCalledOnce()
  })

  it('shows a manual fallback hint when the cover cannot be identified', async () => {
    const user = userEvent.setup()
    vi.mocked(recognizeCover).mockResolvedValue(
      recognition({ identified: false, artist: null, albumTitle: null, visibleText: [] }),
    )
    render(<CatalogPhotoPanel client={client} onUseQuery={vi.fn()} />)

    await user.upload(screen.getByLabelText('Cover photo'), jpegFile())
    await user.click(screen.getByRole('button', { name: 'Recognize cover' }))

    expect(
      await screen.findByText(/could not read enough from that photo/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Search catalog for these clues' }),
    ).not.toBeInTheDocument()
  })

  it('shows a recoverable error when recognition fails', async () => {
    const user = userEvent.setup()
    vi.mocked(recognizeCover).mockRejectedValue(
      new RecognitionError('provider_timeout', 'The recognition service took too long to respond.'),
    )
    render(<CatalogPhotoPanel client={client} onUseQuery={vi.fn()} />)

    await user.upload(screen.getByLabelText('Cover photo'), jpegFile())
    await user.click(screen.getByRole('button', { name: 'Recognize cover' }))

    expect(
      await screen.findByText('The recognition service took too long to respond.'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Recognize cover' })).toBeEnabled()
    })
  })

  it('rejects an invalid file before any recognition', async () => {
    const user = userEvent.setup()
    vi.mocked(validateImageFile).mockImplementation(() => {
      throw new RecognitionError('unsupported_media_type', 'Choose a jpeg, png, webp image.')
    })
    render(<CatalogPhotoPanel client={client} onUseQuery={vi.fn()} />)

    await user.upload(
      screen.getByLabelText('Cover photo'),
      new File([new Uint8Array(10)], 'x.gif', { type: 'image/gif' }),
    )

    expect(screen.getByText('Choose a jpeg, png, webp image.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recognize cover' })).toBeDisabled()
    expect(recognizeCover).not.toHaveBeenCalled()
  })
})
