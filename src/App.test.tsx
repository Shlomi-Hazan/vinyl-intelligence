import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

describe('App scaffold', () => {
  it('renders the Vinyl Intelligence shell', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: 'Vinyl Intelligence' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Milestone 1 scaffold')).toBeInTheDocument()
    expect(screen.getByText('/api/health', { exact: false })).toBeInTheDocument()
  })
})
