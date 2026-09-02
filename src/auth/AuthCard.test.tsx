import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuthCard } from './AuthCard.tsx'

function setup(over: Partial<Parameters<typeof AuthCard>[0]> = {}) {
  const onSignIn = vi.fn(async () => {})
  const onSignUp = vi.fn(async () => {})
  render(
    <AuthCard
      onSignIn={onSignIn}
      onSignUp={onSignUp}
      notice={null}
      errorMessage={null}
      {...over}
    />,
  )
  return { onSignIn, onSignUp, user: userEvent.setup() }
}

describe('AuthCard', () => {
  it('exposes an accessible two-mode switch, sign-in selected by default', () => {
    setup()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Sign in', 'Create account'])
    expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('calls onSignIn with the entered credentials (unchanged semantics)', async () => {
    const { onSignIn, onSignUp, user } = setup()
    await user.type(screen.getByLabelText('Email'), 'a@example.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(onSignIn).toHaveBeenCalledWith('a@example.test', 'password123')
    expect(onSignUp).not.toHaveBeenCalled()
  })

  it('calls onSignUp after switching to create-account mode', async () => {
    const { onSignIn, onSignUp, user } = setup()
    await user.click(screen.getByRole('tab', { name: 'Create account' }))
    await user.type(screen.getByLabelText('Email'), 'new@example.test')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(onSignUp).toHaveBeenCalledWith('new@example.test', 'password123')
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('shows accessible client validation without calling the service', async () => {
    const { onSignIn, user } = setup()
    await user.type(screen.getByLabelText('Email'), 'a@example.test')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Password must be at least 6 characters.',
    )
    expect(onSignIn).not.toHaveBeenCalled()
  })

  it('surfaces a real provider error verbatim in an alert', async () => {
    setup({ errorMessage: 'Invalid login credentials' })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Invalid login credentials',
      ),
    )
  })
})
