import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CuratorPanel } from './CuratorPanel.tsx'
import { requestCuratorRecommendation } from '../lib/curator/client.ts'
import { CuratorError, type CuratorResult } from '../lib/curator/types.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

vi.mock('../lib/curator/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/curator/client.ts')>()
  return { ...actual, requestCuratorRecommendation: vi.fn() }
})

const client = {} as BrowserSupabaseClient
const mockedRequest = vi.mocked(requestCuratorRecommendation)

function okResult(): CuratorResult {
  return {
    status: 'ok',
    interpretedIntent: {
      includeGenres: [],
      excludeGenres: [],
      decades: [],
      minRating: null,
      favoritesOnly: false,
      neverPlayedOnly: false,
      avoidRecentlyPlayed: false,
      recentDays: null,
      preference: 'none',
      energy: 'any',
      mood: null,
      requestedCount: 3,
    },
    candidateCount: 5,
    recommendations: [
      {
        collectionItemId: 'a',
        artist: 'Radiohead',
        title: 'OK Computer',
        year: 1997,
        decade: 1990,
        genres: ['alternative rock'],
        rating: 5,
        favorite: true,
        playCount: 0,
        lastListenedAt: null,
        neverPlayed: true,
        reason: 'A 90s alt-rock landmark you have never played.',
        evidenceKeys: ['never_played', 'decade'],
        isBestMatch: true,
      },
      {
        collectionItemId: 'b',
        artist: 'Nirvana',
        title: 'Nevermind',
        year: 1991,
        decade: 1990,
        genres: ['grunge'],
        rating: 4,
        favorite: false,
        playCount: 2,
        lastListenedAt: '2026-08-01T00:00:00.000Z',
        neverPlayed: false,
        reason: 'Also 90s and highly rated.',
        evidenceKeys: ['rating'],
        isBestMatch: false,
      },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CuratorPanel', () => {
  it('disables Recommend while empty and while pending; shows the char counter', async () => {
    const user = userEvent.setup()
    let resolve: (v: CuratorResult) => void = () => {}
    mockedRequest.mockImplementation(() => new Promise((r) => { resolve = r }))

    render(<CuratorPanel client={client} />)
    const button = screen.getByRole('button', { name: 'Recommend' })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText('Your request'), 'give me 90s rock')
    expect(screen.getByText('16 / 800')).toBeInTheDocument()
    expect(button).toBeEnabled()

    await user.click(button)
    expect(screen.getByRole('button', { name: 'Thinking...' })).toBeDisabled()

    resolve(okResult())
    await waitFor(() => expect(screen.getByText('OK Computer')).toBeInTheDocument())
  })

  it('calls the client with the trimmed request and renders cards + one best match', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue(okResult())

    render(<CuratorPanel client={client} />)
    await user.type(screen.getByLabelText('Your request'), '  90s rock  ')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    await waitFor(() => expect(mockedRequest).toHaveBeenCalledWith(client, '90s rock'))
    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(screen.getAllByText('Best match')).toHaveLength(1)
    expect(within(cards[0]).getByText('OK Computer')).toBeInTheDocument()
    expect(
      within(cards[0]).getByText('A 90s alt-rock landmark you have never played.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Chosen from 5 matching records.')).toBeInTheDocument()
  })

  it('renders the empty-collection state', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue({ status: 'empty_collection' })

    render(<CuratorPanel client={client} />)
    await user.type(screen.getByLabelText('Your request'), 'anything')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    expect(
      await screen.findByText(/the curator only recommends from your own collection/i),
    ).toBeInTheDocument()
  })

  it('renders no_match with the interpreted constraints and keeps the textarea', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue({
      status: 'no_match',
      interpretedIntent: {
        includeGenres: ['rock'],
        excludeGenres: ['jazz'],
        decades: [1990],
        minRating: null,
        favoritesOnly: false,
        neverPlayedOnly: false,
        avoidRecentlyPlayed: true,
        recentDays: 30,
        preference: 'none',
        energy: 'any',
        mood: null,
        requestedCount: 3,
      },
    })

    render(<CuratorPanel client={client} />)
    await user.type(screen.getByLabelText('Your request'), '90s rock no jazz not recent')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    expect(await screen.findByText('No owned records match those constraints.')).toBeInTheDocument()
    expect(screen.getByText('Genres: rock')).toBeInTheDocument()
    expect(screen.getByText('Excluded genres: jazz')).toBeInTheDocument()
    expect(screen.getByText('Decades: 1990s')).toBeInTheDocument()
    expect(screen.getByText('Not played in the last 30 days')).toBeInTheDocument()
    expect(screen.getByLabelText('Your request')).toHaveValue('90s rock no jazz not recent')
  })

  it('renders the fixed out-of-scope message and keeps the request form usable', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue({ status: 'out_of_scope' })

    render(<CuratorPanel client={client} />)
    await user.type(screen.getByLabelText('Your request'), 'write me a python script')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    expect(
      await screen.findByText('VIN can only help you choose something from your record collection.'),
    ).toBeInTheDocument()
    // not styled as a technical error, and the form is still there
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Your request')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recommend' })).toBeEnabled()
    // no conversation / no cards were started
    expect(screen.queryByLabelText('Recommendations')).not.toBeInTheDocument()
  })

  it('renders a retryable error and keeps Recommend enabled', async () => {
    const user = userEvent.setup()
    mockedRequest.mockRejectedValue(new CuratorError('provider_unavailable', 'The curator is unavailable.'))

    render(<CuratorPanel client={client} />)
    await user.type(screen.getByLabelText('Your request'), 'x')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The curator is unavailable.')
    expect(screen.getByRole('button', { name: 'Recommend' })).toBeEnabled()
  })

  it('shows no follow-up input before a result and writes no browser storage', async () => {
    const user = userEvent.setup()
    mockedRequest.mockResolvedValue(okResult())

    render(<CuratorPanel client={client} />)
    // before submitting there is only the initial request textarea
    expect(screen.getByLabelText('Your request')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your follow-up')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Your request'), '90s rock')
    await user.click(screen.getByRole('button', { name: 'Recommend' }))
    await screen.findAllByRole('article')

    // Milestone 10: the refine follow-up input appears only after an ok result
    expect(screen.getByLabelText('Your follow-up')).toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
  })

  describe('onStatusChange -> Vinny state', () => {
    it('reports thinking while pending then success on an ok result', async () => {
      const user = userEvent.setup()
      let resolve: (v: CuratorResult) => void = () => {}
      mockedRequest.mockImplementation(() => new Promise((r) => { resolve = r }))
      const onStatusChange = vi.fn()

      render(<CuratorPanel client={client} onStatusChange={onStatusChange} />)
      expect(onStatusChange).toHaveBeenLastCalledWith('idle')

      await user.type(screen.getByLabelText('Your request'), '90s rock')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))
      expect(onStatusChange).toHaveBeenLastCalledWith('thinking')

      resolve(okResult())
      await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith('success'))
    })

    it('reports no-match on a no_match result', async () => {
      const user = userEvent.setup()
      mockedRequest.mockResolvedValue({
        status: 'no_match',
        interpretedIntent: {
          includeGenres: [], excludeGenres: [], decades: [], minRating: null,
          favoritesOnly: false, neverPlayedOnly: false, avoidRecentlyPlayed: false,
          recentDays: null, preference: 'none', energy: 'any', mood: null,
          requestedCount: 3,
        },
      })
      const onStatusChange = vi.fn()

      render(<CuratorPanel client={client} onStatusChange={onStatusChange} />)
      await user.type(screen.getByLabelText('Your request'), 'polka from 2024')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))

      await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith('no-match'))
    })

    it('reports idle (not no-match) on a technical error', async () => {
      const user = userEvent.setup()
      mockedRequest.mockRejectedValue(
        new CuratorError('provider_unavailable', 'The curator is unavailable.'),
      )
      const onStatusChange = vi.fn()

      render(<CuratorPanel client={client} onStatusChange={onStatusChange} />)
      await user.type(screen.getByLabelText('Your request'), 'x')
      await user.click(screen.getByRole('button', { name: 'Recommend' }))

      await screen.findByRole('alert')
      expect(onStatusChange).toHaveBeenLastCalledWith('idle')
      expect(onStatusChange).not.toHaveBeenCalledWith('no-match')
      expect(onStatusChange).not.toHaveBeenCalledWith('success')
    })
  })
})
