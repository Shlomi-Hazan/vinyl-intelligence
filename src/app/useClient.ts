import { useAuth } from '../auth/useAuth.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

/**
 * The authenticated Supabase client. Only call this inside the authenticated
 * route tree, where AppRoutes has already established a non-null client + user.
 */
export function useClient(): { client: BrowserSupabaseClient; userId: string } {
  const { client, user } = useAuth()
  if (!client || !user) {
    throw new Error('useClient used outside the authenticated route tree.')
  }
  return { client, userId: user.id }
}
