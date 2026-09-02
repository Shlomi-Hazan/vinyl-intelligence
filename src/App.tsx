import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { AppRoutes } from './app/AppRoutes.tsx'
import { ToastProvider } from './ui/ToastProvider.tsx'
import type { BrowserSupabaseClient } from './lib/supabase/client.ts'

type AppProps = {
  client?: BrowserSupabaseClient
}

function App({ client }: AppProps) {
  return (
    <AuthProvider client={client}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
