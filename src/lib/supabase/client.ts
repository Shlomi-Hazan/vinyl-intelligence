import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Profile = {
  id: string
  display_name: string | null
  created_at: string
  updated_at: string
}

type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: never
        Update: {
          display_name?: string | null
        }
      }
    }
  }
}

export type BrowserSupabaseClient = SupabaseClient<Database>

let browserClient: BrowserSupabaseClient | null = null

export function getSupabaseClient(): BrowserSupabaseClient {
  if (browserClient) {
    return browserClient
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Missing Supabase browser configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    )
  }

  browserClient = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return browserClient
}
