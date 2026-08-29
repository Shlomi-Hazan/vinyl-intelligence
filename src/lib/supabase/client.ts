import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Profile = {
  id: string
  display_name: string | null
  created_at: string
  updated_at: string
}

export type Release = {
  id: string
  created_by: string | null
  source: 'manual' | 'catalog'
  provider: 'musicbrainz' | null
  provider_release_id: string | null
  provider_release_group_id: string | null
  artist: string
  title: string
  release_year: number | null
  label: string | null
  catalog_number: string | null
  country: string | null
  format: string | null
  created_at: string
  updated_at: string
}

export type CollectionItem = {
  id: string
  user_id: string
  release_id: string
  added_at: string
  created_at: string
}

type Database = {
  public: {
    Tables: {
      collection_items: {
        Row: CollectionItem
        Insert: {
          id?: string
          user_id?: string
          release_id: string
          added_at?: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'collection_items_release_id_fkey'
            columns: ['release_id']
            isOneToOne: false
            referencedRelation: 'releases'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'collection_items_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: Profile
        Insert: {
          id: string
          display_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          display_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      releases: {
        Row: Release
        Insert: {
          id?: string
          created_by?: string | null
          source?: 'manual'
          provider?: null
          provider_release_id?: null
          provider_release_group_id?: null
          artist: string
          title: string
          release_year?: number | null
          label?: string | null
          catalog_number?: string | null
          country?: string | null
          format?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          artist?: string
          title?: string
          release_year?: number | null
          label?: string | null
          catalog_number?: string | null
          country?: string | null
          format?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'releases_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
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
