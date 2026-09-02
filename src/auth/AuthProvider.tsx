import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './AuthContext.ts'
import {
  getSupabaseClient,
  type BrowserSupabaseClient,
  type Profile,
} from '../lib/supabase/client.ts'
import { fetchOwnProfile, updateOwnProfile } from '../lib/supabase/profile.ts'

type AuthProviderProps = {
  children: ReactNode
  client?: BrowserSupabaseClient
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

export function AuthProvider({ children, client: injectedClient }: AuthProviderProps) {
  const clientState = useMemo(() => {
    try {
      return {
        client: injectedClient ?? getSupabaseClient(),
        configErrorMessage: null,
      }
    } catch (error) {
      return {
        client: null,
        configErrorMessage: getErrorMessage(error),
      }
    }
  }, [injectedClient])

  const client = clientState.client
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!client) {
      return undefined
    }

    let isActive = true

    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isActive) {
          return
        }

        if (error) {
          throw error
        }

        setSession(data.session ?? null)
        setStatus(data.session ? 'loading' : 'unauthenticated')
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return
        }

        setStatus('error')
        setErrorMessage(getErrorMessage(error))
      })

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!isActive) {
        return
      }

      setSession(nextSession)
      setNotice(null)
      setErrorMessage(null)

      if (!nextSession) {
        setProfile(null)
        setStatus('unauthenticated')
        return
      }

      setStatus('loading')
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [client])

  useEffect(() => {
    if (!client || !session?.user) {
      return undefined
    }

    let isActive = true

    fetchOwnProfile(client, session.user.id)
      .then((nextProfile) => {
        if (!isActive) {
          return
        }

        setProfile(nextProfile)
        setStatus(nextProfile ? 'authenticated' : 'profile_missing')
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return
        }

        setStatus('error')
        setErrorMessage(getErrorMessage(error))
      })

    return () => {
      isActive = false
    }
  }, [client, session])

  const signUp = useCallback(
    async (email: string, password: string) => {
      if (!client) {
        setStatus('error')
        setErrorMessage('Supabase client is not configured.')
        return
      }

      setErrorMessage(null)
      setNotice(null)

      const { data, error } = await client.auth.signUp({ email, password })

      if (error) {
        setSession(null)
        setProfile(null)
        setStatus('unauthenticated')
        setErrorMessage(error.message)
        return
      }

      if (data.session) {
        setSession(data.session)
        setStatus('loading')
        return
      }

      setSession(null)
      setProfile(null)
      setStatus('unauthenticated')
      setNotice('Check your email to confirm your account before signing in.')
    },
    [client],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!client) {
        setStatus('error')
        setErrorMessage('Supabase client is not configured.')
        return
      }

      setErrorMessage(null)
      setNotice(null)

      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setSession(null)
        setProfile(null)
        setStatus('unauthenticated')
        setErrorMessage(error.message)
        return
      }

      setSession(data.session ?? null)
      setStatus(data.session ? 'loading' : 'unauthenticated')
    },
    [client],
  )

  const signOut = useCallback(async () => {
    if (!client) {
      return
    }

    setErrorMessage(null)
    setNotice(null)

    const { error } = await client.auth.signOut({ scope: 'local' })

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSession(null)
    setProfile(null)
    setNotice(null)
    setErrorMessage(null)
    setStatus('unauthenticated')
  }, [client])

  const refreshProfile = useCallback(async () => {
    if (!client || !session?.user) {
      return
    }
    try {
      const next = await fetchOwnProfile(client, session.user.id)
      setProfile(next)
      if (next) {
        setStatus('authenticated')
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }, [client, session])

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!client || !session?.user) {
        setStatus('error')
        setErrorMessage('You must be signed in to update your profile.')
        return
      }

      setErrorMessage(null)
      setNotice(null)

      try {
        const nextProfile = await updateOwnProfile(
          client,
          session.user.id,
          displayName,
        )
        setProfile(nextProfile)
        setStatus('authenticated')
        setNotice('Profile saved.')
      } catch (error) {
        setErrorMessage(getErrorMessage(error))
      }
    },
    [client, session],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status: clientState.configErrorMessage ? 'error' : status,
      client,
      session,
      user: session?.user ?? null,
      profile,
      notice,
      errorMessage: clientState.configErrorMessage ?? errorMessage,
      signUp,
      signIn,
      signOut,
      updateDisplayName,
      refreshProfile,
    }),
    [
      status,
      client,
      session,
      profile,
      notice,
      errorMessage,
      signUp,
      signIn,
      signOut,
      updateDisplayName,
      refreshProfile,
      clientState.configErrorMessage,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
