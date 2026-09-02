import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../app/PageHeader.tsx'
import { AlbumArtwork } from '../media/AlbumArtwork.tsx'
import { VinAvatar } from '../brand/VinAvatar.tsx'
import { EmptyCrate } from '../brand/EmptyCrate.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Button, Input } from '../ui/primitives.tsx'
import { ErrorState, SkeletonAlbumCard, SkeletonStat } from '../ui/feedback.tsx'
import { useAuth } from '../auth/useAuth.ts'
import { useCollectionData } from '../app/useCollectionData.ts'
import {
  collectionStats,
  decadeDistribution,
  listeningStats,
  recentlyAdded,
  recentlyPlayed,
  rediscover,
  topGenres,
} from '../lib/dashboard/insights.ts'
import type { CollectionItemWithRelease } from '../lib/supabase/collection.ts'

const QUICK_VIN_CHIPS = [
  'Something relaxing',
  'A forgotten favorite',
  '90s tonight',
  'Surprise me',
]

function AlbumMini({ item }: { item: CollectionItemWithRelease }) {
  return (
    <Link to={`/collection/${item.id}`} className="vi-albumcard">
      <AlbumArtwork
        artist={item.release.artist}
        title={item.release.title}
        seedId={item.release.id}
        size="grid"
      />
      <span className="vi-albumcard__title">{item.release.title}</span>
      <span className="vi-albumcard__meta">{item.release.artist}</span>
    </Link>
  )
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string
  value: string | number
  muted?: boolean
}) {
  return (
    <div className="vi-stat">
      <div className={muted ? 'vi-stat__value vi-stat__value--muted' : 'vi-stat__value'}>
        {value}
      </div>
      <div className="vi-stat__label">{label}</div>
    </div>
  )
}

export function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const {
    items,
    events,
    status,
    error,
    eventsStatus,
    eventsError,
    reload,
    reloadEvents,
  } = useCollectionData()
  const [quickVin, setQuickVin] = useState('')

  const name = profile?.display_name?.trim()
  // Fixed at mount: the stats do not need to tick, and this keeps render pure.
  const [now] = useState(() => Date.now())

  const collStats = useMemo(() => collectionStats(items), [items])
  const added = useMemo(() => recentlyAdded(items, 6), [items])
  const decades = useMemo(() => decadeDistribution(items), [items])
  const genres = useMemo(() => topGenres(items, 5), [items])

  // ---- listening-derived values: ONLY computed when events are truly loaded.
  // Absence of loaded event data is NOT evidence that nothing was ever played,
  // so we never turn `events === []` (loading / failure) into analytics.
  const eventsReady = eventsStatus === 'ready'
  const listenStats = useMemo(
    () => (eventsReady ? listeningStats(items, events, now) : null),
    [eventsReady, items, events, now],
  )
  const played = useMemo(
    () =>
      eventsReady ? recentlyPlayed(items, events, 6).map((e) => e.item) : [],
    [eventsReady, items, events],
  )
  const forgotten = useMemo(
    () => (eventsReady ? rediscover(items, events, now, 4) : []),
    [eventsReady, items, events, now],
  )

  function submitQuickVin(event: FormEvent) {
    event.preventDefault()
    const trimmed = quickVin.trim()
    // Client-only navigation with a transient prefill. No curator/model call
    // happens here - VinPage only pre-fills its textarea.
    navigate('/vin', trimmed ? { state: { prefill: trimmed } } : undefined)
  }

  const loading = status === 'loading'
  const populated = status === 'ready' && items.length > 0
  const emptyCollection = status === 'ready' && items.length === 0

  return (
    <div className="vi-page vi-page--wide">
      <PageHeader
        eyebrow="Home"
        title={name ? `Welcome back, ${name}` : 'Welcome back, listener'}
      />

      {status === 'error' ? (
        <ErrorState
          message={error ?? 'Could not load your collection.'}
          onRetry={reload}
        />
      ) : null}

      {emptyCollection ? (
        <div className="vi-onboard">
          <div className="vi-onboard__figure">
            <EmptyCrate size={200} />
            <VinAvatar size={120} />
          </div>
          <h2>Your crate is empty</h2>
          <p>
            Add the records you own - by catalog search or by scanning a cover -
            and this page fills with your collection, your listening, and VIN's
            picks.
          </p>
          <div className="vi-onboard__cta">
            <Link to="/discover" className="vi-btn vi-btn--primary vi-btn--lg">
              Add a record
            </Link>
            <Link to="/scan" className="vi-btn vi-btn--secondary vi-btn--lg">
              Scan a cover
            </Link>
          </div>
        </div>
      ) : null}

      {loading || populated ? (
        <div className="vi-dash">
          <section aria-label="Collection stats" className="vi-statgrid">
            {loading ? (
              <>
                <SkeletonStat />
                <SkeletonStat />
                <SkeletonStat />
                <SkeletonStat />
              </>
            ) : (
              <>
                <Stat label="Records" value={collStats.collectionSize} />
                <Stat label="Favorites" value={collStats.favorites} />
                {listenStats ? (
                  <>
                    <Stat label="Played (30 days)" value={listenStats.playedInWindow} />
                    <Stat label="Never played" value={listenStats.neverPlayed} />
                  </>
                ) : eventsStatus === 'error' ? (
                  <>
                    <Stat label="Played (30 days)" value="--" muted />
                    <Stat label="Never played" value="--" muted />
                  </>
                ) : (
                  <>
                    <SkeletonStat />
                    <SkeletonStat />
                  </>
                )}
              </>
            )}
          </section>

          {eventsStatus === 'error' && populated ? (
            <p className="vi-error-text" role="alert">
              Listening history is unavailable, so play counts are hidden.{' '}
              <button
                type="button"
                className="vi-btn vi-btn--ghost vi-btn--sm"
                onClick={reloadEvents}
              >
                Retry
              </button>
            </p>
          ) : null}

          {populated ? (
            <div className="vi-dash__grid">
              <div className="vi-dash__col">
                <div className="vi-quickvin">
                  <div className="vi-quickvin__head">
                    <VinAvatar size={56} />
                    <div>
                      <strong>Quick VIN</strong>
                      <p className="vi-hint" style={{ margin: 0 }}>
                        What are you in the mood for? VIN picks from your own
                        collection.
                      </p>
                    </div>
                  </div>
                  <div className="vi-quickvin__chips">
                    {QUICK_VIN_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="vi-chip"
                        onClick={() => setQuickVin(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  <form onSubmit={submitQuickVin}>
                    <Input
                      aria-label="Quick VIN prompt"
                      placeholder="e.g. something warm from the 70s I have not played lately"
                      value={quickVin}
                      onChange={(e) => setQuickVin(e.target.value)}
                    />
                    <Button variant="primary" type="submit">
                      Ask VIN
                    </Button>
                  </form>
                </div>

                <section className="vi-dash__section">
                  <div className="vi-dash__section-head">
                    <h2>Recently added</h2>
                    {added.length > 0 ? <Link to="/collection">View all</Link> : null}
                  </div>
                  {added.length === 0 ? (
                    <p className="vi-hint">Nothing added yet.</p>
                  ) : (
                    <div className="vi-dash-albumrow">
                      {added.map((item) => (
                        <AlbumMini key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </section>

                <section className="vi-dash__section">
                  <div className="vi-dash__section-head">
                    <h2>Recently played</h2>
                    {eventsReady && played.length > 0 ? (
                      <Link to="/history">History</Link>
                    ) : null}
                  </div>
                  {eventsStatus === 'error' ? (
                    <ErrorState
                      message={eventsError ?? 'Could not load your listening history.'}
                      onRetry={reloadEvents}
                    />
                  ) : eventsStatus === 'loading' ? (
                    <div className="vi-dash-albumrow">
                      <SkeletonAlbumCard />
                      <SkeletonAlbumCard />
                      <SkeletonAlbumCard />
                    </div>
                  ) : played.length === 0 ? (
                    <p className="vi-hint">
                      No listens logged yet. Mark a record played to build your
                      history.
                    </p>
                  ) : (
                    <div className="vi-dash-albumrow">
                      {played.map((item) => (
                        <AlbumMini key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="vi-dash__col">
                <section className="vi-dash__section">
                  <h2>Quick actions</h2>
                  <div className="vi-quickactions">
                    <Link to="/discover" className="vi-quickaction">
                      <Icon name="plus" size={20} />
                      <strong>Add record</strong>
                      <span>Catalog search</span>
                    </Link>
                    <Link to="/scan" className="vi-quickaction">
                      <Icon name="scan" size={20} />
                      <strong>Scan cover</strong>
                      <span>Photo identify</span>
                    </Link>
                    <Link to="/vin" className="vi-quickaction">
                      <Icon name="vin" size={20} />
                      <strong>Ask VIN</strong>
                      <span>From your own</span>
                    </Link>
                  </div>
                </section>

                <section className="vi-dash__section">
                  <h2>Rediscover</h2>
                  {eventsStatus === 'error' ? (
                    <ErrorState
                      message="Rediscover needs your listening history, which is unavailable."
                      onRetry={reloadEvents}
                    />
                  ) : eventsStatus === 'loading' ? (
                    <div className="vi-dash-albumrow">
                      <SkeletonAlbumCard />
                      <SkeletonAlbumCard />
                    </div>
                  ) : forgotten.length === 0 ? (
                    <p className="vi-hint">
                      Play a few more records and VIN will resurface the ones you
                      forget.
                    </p>
                  ) : (
                    <div className="vi-dash-albumrow">
                      {forgotten.map((item) => (
                        <AlbumMini key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </section>

                <section className="vi-dash__section">
                  <h2>Your collection at a glance</h2>
                  {decades.length > 0 || genres.length > 0 ? (
                    <div className="vi-insight">
                      {decades.length > 0 ? (
                        <div>
                          <p className="vi-hint" style={{ marginBottom: 'var(--space-3)' }}>
                            By decade
                          </p>
                          <div className="vi-bars">
                            {decades.map((slice) => (
                              <div className="vi-bar" key={slice.decade}>
                                <span>{slice.decade}</span>
                                <span className="vi-bar__track">
                                  <span
                                    className="vi-bar__fill"
                                    style={{ width: `${slice.pct}%` }}
                                  />
                                </span>
                                <span className="vi-bar__val">{slice.pct}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {genres.length > 0 ? (
                        <div>
                          <p className="vi-hint" style={{ marginBottom: 'var(--space-3)' }}>
                            Top genres
                          </p>
                          <div className="vi-genre-tags">
                            {genres.map((g) => (
                              <span className="vi-chip" key={g.genre}>
                                {g.genre} <span className="vi-bar__val">{g.count}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="vi-hint">
                      Add a few more records with release years and genres to see
                      your collection's shape.
                    </p>
                  )}
                </section>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
