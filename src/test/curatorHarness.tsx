import { render, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { ReactElement } from 'react'
import {
  CollectionDataContext,
  type CollectionData,
} from '../app/collection-data-context.ts'

/**
 * A `CollectionData` context value for curator tests. Defaults to a ready,
 * empty collection with ready, empty listening events. Override any field
 * (e.g. `items`, `events`, `eventsStatus`, or a spied `reloadEvents`).
 */
export function makeCollectionData(
  overrides: Partial<CollectionData> = {},
): CollectionData {
  return {
    items: [],
    events: [],
    status: 'ready',
    error: null,
    eventsStatus: 'ready',
    eventsError: null,
    version: 1,
    reload: vi.fn(),
    invalidate: vi.fn(),
    reloadEvents: vi.fn(),
    ...overrides,
  }
}

/**
 * Render a curator component inside the providers it needs in the real app: a
 * router (for the recommendation cards' `View record` links) and the shared
 * collection data (for card artwork + live listening facts).
 */
export function renderWithCuratorProviders(
  ui: ReactElement,
  collection: Partial<CollectionData> = {},
): RenderResult {
  return render(
    <MemoryRouter>
      <CollectionDataContext.Provider value={makeCollectionData(collection)}>
        {ui}
      </CollectionDataContext.Provider>
    </MemoryRouter>,
  )
}
