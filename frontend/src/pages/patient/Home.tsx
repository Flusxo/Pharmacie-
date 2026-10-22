import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import type { MessageKey } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePlace } from '../../lib/location';
import { formatDate, formatKm } from '../../lib/format';
import type { NearbyPharmacy, OrderSummary, RequestSummary } from '../../lib/types';
import { SearchBox } from '../../components/SearchBox';
import { OnboardingTour } from '../../components/Tour';
import { LocationControl } from '../../components/LocationControl';
import { LazyMap } from '../../components/map/LazyMap';
import { HeroPoster } from '../../components/three/ThreeVisuals';
import { AnimatedNumber, Reveal, RotatingWord, TiltCard, WordReveal } from '../../components/motion';
import { CardSkeleton, Empty, OpenBadge, StatusBadge } from '../../components/ui';

const CATEGORY_EMOJI: Record<string, string> = {
  pain: '🌡️',
  allergy: '🌼',
  cold: '🤧',
  digestion: '🫖',
  vitamins: '🍊',
  skin: '🧴',
  antibiotics: '💊',
  diabetes: '🩸',
  cardio: '❤️',
  respiratory: '🫁',
  hormones: '🦋',
};

const RADIUS_KM = 25;

export function HomePage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { place } = usePlace();
  const [categories, setCategories] = useState<{ category: string; count: number }[] | null>(null);
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [nearby, setNearby] = useState<NearbyPharmacy[] | null>(null);

  useEffect(() => {
    api<{ items: { category: string; count: number }[] }>('/medicines/categories')
      .then((r) => setCategories(r.items))
      .catch(() => setCategories([]));
    api<{ items: OrderSummary[] }>('/patient/orders')
      .then((r) => setOrders(r.items.slice(0, 3)))
      .catch(() => setOrders([]));
    api<{ items: RequestSummary[] }>('/patient/requests')
      .then((r) => setRequests(r.items.filter((x) => x.source === 'doctor' && x.status === 'received')))
      .catch(() => setRequests([]));
  }, []);

  useEffect(() => {
    setNearby(null);
    api<{ items: NearbyPharmacy[] }>('/pharmacies/nearby', { query: { lat: place.lat, lon: place.lon, radiusKm: RADIUS_KM } })
      .then((r) => setNearby(r.items))
      .catch(() => setNearby([]));
  }, [place.lat, place.lon]);

  const name = user?.patient?.firstName ?? user?.displayName ?? '';

  // Scroll progress through the hero (drives the 3D camera and the step texts).
  const heroRef = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const el = heroRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      progress.current = p;
      setStep(p < 0.33 ? 0 : p < 0.66 ? 1 : 2);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="stack" style={{ gap: 28 }}>
      <OnboardingTour />
      <section className="hero-3d" ref={heroRef} aria-labelledby="hello" data-step={step}>
        <div className="hero-sticky">
          {/* The 3D comes from the root stage behind the page (app-home composition); the poster is the fallback. */}
          <div className="hero-visual">
            <HeroPoster />
          </div>
          <div className="hero-copy">
            <div className="hero-panel stack">
              <WordReveal id="hello" text={t('home.greeting', { name })} />
              <p className="muted" style={{ fontSize: '1.1rem', margin: 0 }}>
                {t('home.lead')}
              </p>
              <p className="small" style={{ margin: 0 }}>
                {t('home.forExample')} <RotatingWord words={[t('home.word1'), t('home.word2'), t('home.word3')]} />
              </p>
              <div data-tour="search">
                <SearchBox />
              </div>
              <LocationControl compact />
            </div>
            <ol className="hero-steps" aria-label={t('home.heroStepsLabel')}>
              {(['home.heroStep1', 'home.heroStep2', 'home.heroStep3'] as const).map((k, i) => (
                <li key={k} className={step >= i ? 'on' : ''}>
                  {t(k)}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {requests.length > 0 && (
        <section className="card stack" aria-labelledby="doc-req">
          <h2 id="doc-req">{t('home.doctorRequests')}</h2>
          {requests.map((r) => (
            <div key={r.id} className="row between">
              <span>{r.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</span>
              <Link className="btn small" to={`/requests/${r.id}`}>
                {t('home.chooseNow')}
              </Link>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="cats">
        <div className="section-head">
          <h2 id="cats">{t('home.categories')}</h2>
          <Link to="/search">{t('common.seeAll')}</Link>
        </div>
        <div className="grid cols-4">
          {categories === null
            ? Array.from({ length: 8 }, (_, i) => <CardSkeleton key={i} lines={1} />)
            : categories.map((c, i) => (
                <Reveal key={c.category} index={i}>
                  <TiltCard>
                    <Link to={`/search?category=${c.category}`} className="card lift category-card">
                      <span className="emoji" aria-hidden="true">
                        {CATEGORY_EMOJI[c.category] ?? '💊'}
                      </span>
                      <strong>{t(`cat.${c.category}` as MessageKey)}</strong>
                      <span className="muted small">
                        <AnimatedNumber value={c.count} /> {c.count === 1 ? t('cat.unitOne') : t('cat.unit')}
                      </span>
                    </Link>
                  </TiltCard>
                </Reveal>
              ))}
        </div>
      </section>

      <div className="grid cols-2">
        <section className="card stack" aria-labelledby="recent">
          <h2 id="recent">{t('home.recentOrders')}</h2>
          {orders === null ? (
            <CardSkeleton />
          ) : orders.length === 0 ? (
            <p className="muted">{t('home.noOrders')}</p>
          ) : (
            orders.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="row between" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="stack" style={{ gap: 2 }}>
                  <strong>{o.items.map((i) => i.name).join(', ')}</strong>
                  <span className="muted small">
                    {o.pharmacyName} · {formatDate(o.createdAt, locale)}
                  </span>
                </span>
                <StatusBadge status={o.status} />
              </Link>
            ))
          )}
        </section>

        <section className="card stack" aria-labelledby="around">
          <div className="row between">
            <h2 id="around" style={{ margin: 0 }}>
              {t('home.aroundYou')}
            </h2>
            <Link to="/map" className="btn secondary small">
              {t('home.openMap')}
            </Link>
          </div>
          <LazyMap center={place} radiusKm={RADIUS_KM} pharmacies={nearby ?? []} height={220} />
          {nearby === null ? (
            <CardSkeleton />
          ) : nearby.length === 0 ? (
            <Empty>{t('med.noPharmacies')}</Empty>
          ) : (
            <>
              <p className="muted small" style={{ margin: 0 }}>
                {nearby.length === 1
                  ? t('home.pharmaciesNearOne', { km: RADIUS_KM })
                  : t('home.pharmaciesNear', { n: nearby.length, km: RADIUS_KM })}
              </p>
              {nearby.slice(0, 4).map((p) => (
                <div key={p.id} className="row between">
                  <span className="stack" style={{ gap: 2 }}>
                    <strong>{p.name}</strong>
                    <span className="muted small">
                      {p.city} · {formatKm(p.distanceKm, locale)}
                    </span>
                  </span>
                  <OpenBadge hours={p.openingHours} onDuty={p.onDuty} />
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
