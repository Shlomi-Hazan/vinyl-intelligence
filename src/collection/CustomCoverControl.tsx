import { useId, useRef, useState } from 'react'
import { Button } from '../ui/primitives.tsx'
import {
  CustomCoverError,
  removeCustomCover,
  uploadCustomCover,
} from '../lib/collection/customCover.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'
import type { BrowserSupabaseClient } from '../lib/supabase/client.ts'

/*
 * Lightweight custom-cover management for one owned collection item. Owner-only
 * (RLS + bucket config enforce it server-side). Kept intentionally small so the
 * full Album Detail redesign (Phase D) can absorb it unchanged.
 */

type Props = {
  client: BrowserSupabaseClient
  userId: string
  item: CollectionItemWithRelease
  /** Called after a successful upload / remove so artwork refreshes. */
  onChanged: () => void
}

type Phase = 'idle' | 'working' | 'error'

export function CustomCoverControl({ client, userId, item, onChanged }: Props) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const hasCustom = Boolean(item.custom_cover_path)

  async function handleFile(file: File | undefined) {
    if (!file) {
      return
    }
    setPhase('working')
    setMessage(null)
    try {
      await uploadCustomCover(client, userId, item.id, file)
      setPhase('idle')
      onChanged()
    } catch (error) {
      setPhase('error')
      setMessage(
        error instanceof CustomCoverError
          ? error.message
          : 'Could not set that cover. Try again.',
      )
    } finally {
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  async function handleRemove() {
    setPhase('working')
    setMessage(null)
    try {
      await removeCustomCover(client, userId, item.id)
      setPhase('idle')
      onChanged()
    } catch (error) {
      setPhase('error')
      setMessage(
        error instanceof CustomCoverError
          ? error.message
          : 'Could not remove the custom cover.',
      )
    }
  }

  const working = phase === 'working'

  return (
    <section className="vi-covercontrol" aria-label="Album cover">
      <h3>Cover art</h3>
      <p className="vi-hint">
        {hasCustom
          ? 'Using your own image. Remove it to fall back to catalog artwork.'
          : 'Catalog artwork is used by default. You can upload your own.'}
      </p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={working}
        onChange={(e) => void handleFile(e.target.files?.[0])}
        className="vi-visually-hidden"
      />
      <div className="vi-covercontrol__actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={working}
          onClick={() => inputRef.current?.click()}
        >
          {working ? 'Working…' : hasCustom ? 'Replace cover' : 'Use my own cover'}
        </Button>
        {hasCustom ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={working}
            onClick={() => void handleRemove()}
          >
            Remove custom cover
          </Button>
        ) : null}
      </div>

      {message ? (
        <p className="vi-error-text" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  )
}
