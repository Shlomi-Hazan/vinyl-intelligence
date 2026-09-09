import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CollectionForm } from './CollectionForm.tsx'

describe('CollectionForm - multilingual input direction (spec 0015)', () => {
  it('gives every free-text metadata control dir="auto" and leaves the year LTR', () => {
    render(<CollectionForm mode="add" onSubmit={vi.fn()} />)

    for (const name of ['Artist', 'Title', 'Label', 'Country', 'Genre']) {
      expect(screen.getByRole('textbox', { name })).toHaveAttribute('dir', 'auto')
    }
    // release year is numeric and stays left-to-right
    expect(screen.getByRole('textbox', { name: 'Release year' })).not.toHaveAttribute(
      'dir',
    )
  })
})
