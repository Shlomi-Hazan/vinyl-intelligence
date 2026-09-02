import { useEffect, useRef, useState } from 'react'

function shouldRevealImmediately(): boolean {
  if (typeof IntersectionObserver === 'undefined') {
    return true
  }
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Reveal-on-scroll. Returns a ref to attach to a section and a `revealed`
 * boolean that flips true once the element enters the viewport (and stays
 * true). Under `prefers-reduced-motion` (or without IntersectionObserver) it
 * starts revealed. The visual transition itself is CSS - this only toggles a
 * flag.
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [revealed, setRevealed] = useState(shouldRevealImmediately)

  useEffect(() => {
    const node = ref.current
    if (!node || revealed) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [revealed])

  return { ref, revealed }
}
