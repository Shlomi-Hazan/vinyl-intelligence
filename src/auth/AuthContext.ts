import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile } from '../lib/supabase/client.ts'

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'authenticated'
  | 'profile_missing'
  | 'error'

export type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  user: User | null
  profile: Profile | null
  notice: string | null
  errorMessage: string | null
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updateDisplayName: (displayName: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
