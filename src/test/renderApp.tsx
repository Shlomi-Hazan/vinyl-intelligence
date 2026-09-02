import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { AuthProvider } from '../auth/AuthProvider.tsx'
import { AppRoutes } from '../app/AppRoutes.tsx'
import { ToastProvider } from '../ui/ToastProvider.tsx'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

type RenderAppOptions = {
  client?: BrowserSupabaseClient
  route?: string
}

/**
 * Renders the full app (auth + toast + router) at a given route with a
 * MemoryRouter, matching how the app composes in `App.tsx` minus BrowserRouter.
 */
export function renderApp({ client, route = '/' }: RenderAppOptions = {}) {
  return render(
    <AuthProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes />
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>,
  )
}

export function renderWithRouter(ui: ReactElement, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}
