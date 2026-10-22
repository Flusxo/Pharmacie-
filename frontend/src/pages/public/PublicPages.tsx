/** Public website pages (before login). Copy lives in locales/*.json under "pub.*". */
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, type MessageKey } from '../../i18n';
import { CtaBand, Faq, FeatureGrid, PublicHero, Section, SimNote, Steps } from '../../components/public/Sections';
import { HeroArt } from '../../components/public/HeroArt';
import { AnimatedNumber, Reveal } from '../../components/motion';
import {
  IconCapsule,
  IconCheck,
  IconChoice,
  IconClock,
  IconDoc,
  IconList,
  IconLock,
  IconMap,
  IconSearch,
  IconShield,
  IconStethoscope,
  IconStore,
  IconTruck,
  IconUser,
} from '../../components/Icons';

const FAQ_ALL = Array.from({ length: 10 }, (_, i) => ({ q: `pub.faq.q${i + 1}` as MessageKey, a: `pub.faq.a${i + 1}` as MessageKey }));

function AccountCtas({ role = 'patient' }: { role?: 'patient' | 'pharmacy' | 'doctor' }) {
  const { t } = useI18n();
  const label: MessageKey =
    role === 'pharmacy' ? 'pub.cta.pharmacyAccount' : role === 'doctor' ? 'pub.cta.doctorAccount' : 'pub.cta.patientAccount';
  return (
    <>
      <Link to={`/register?role=${role}`} className="btn">
        {t(label)}
      </Link>
      <Link to="/login" className="btn secondary">
        {t('pub.login')}
      </Link>
    </>
  );
}

export function PublicHome() {
  const { t } = useI18n();
  return (
    <div className="pub-page">
      <PublicHero
        eyebrow={t('pub.home.eyebrow')}
        title={t('pub.home.title')}
        lead={t('pub.home.lead')}
        visual={<HeroArt kind="home" />}
        actions={
          <>
            <Link to="/register?role=patient" className="btn">
              {t('pub.cta.patientAccount')}
            </Link>
            <Link to="/how-it-works" className="btn secondary">
              {t('pub.cta.how')}
            </Link>
          </>
        }
      />
      <ul className="trust-strip" aria-label={t('pub.home.rulesTitle')}>
        {(['pub.home.trust1', 'pub.home.trust2', 'pub.home.trust3'] as const).map((k) => (
          <li key={k}>
            <IconCheck width={18} height={18} /> {t(k)}
          </li>
        ))}
      </ul>

      <Section id="roles" title={t('pub.home.rolesTitle')} lead={t('pub.home.rolesLead')}>
        <FeatureGrid
          items={[
            { icon: <IconUser />, title: 'pub.nav.patients', text: 'pub.home.rolePatients', to: '/patients' },
            { icon: <IconStore />, title: 'pub.nav.pharmacies', text: 'pub.home.rolePharmacies', to: '/pharmacies' },
            { icon: <IconStethoscope />, title: 'pub.nav.doctors', text: 'pub.home.roleDoctors', to: '/doctors' },
          ]}
        />
      </Section>

      <Section id="steps" title={t('pub.home.stepsTitle')}>
        <Steps
          items={[
            { title: 'pub.home.s1t', text: 'pub.home.s1' },
            { title: 'pub.home.s2t', text: 'pub.home.s2' },
            { title: 'pub.home.s3t', text: 'pub.home.s3' },
            { title: 'pub.home.s4t', text: 'pub.home.s4' },
          ]}
        />
      </Section>

      <Section id="rules" title={t('pub.home.rulesTitle')}>
        <FeatureGrid
          items={[
            { icon: <IconStore />, title: 'pub.home.r1t', text: 'pub.home.r1' },
            { icon: <IconChoice />, title: 'pub.home.r2t', text: 'pub.home.r2' },
            { icon: <IconDoc />, title: 'pub.home.r3t', text: 'pub.home.r3' },
            { icon: <IconLock />, title: 'pub.home.r4t', text: 'pub.home.r4' },
          ]}
        />
      </Section>

      <Section id="demo" title={t('pub.home.demoTitle')}>
        <div className="stat-grid">
          {(
            [
              [50, 'pub.home.statMedicines'],
              [8, 'pub.home.statPharmacies'],
              [3, 'pub.home.statDoctors'],
              [30, 'pub.home.statMinutes'],
            ] as const
          ).map(([n, k], i) => (
            <Reveal key={k} index={i} className="stat glass">
              <strong>
                <AnimatedNumber value={n} />
              </strong>
              <span className="muted">{t(k)}</span>
            </Reveal>
          ))}
        </div>
        <SimNote />
      </Section>

      <CtaBand title={t('pub.home.ctaTitle')} text={t('pub.home.ctaText')} actions={<AccountCtas />} />
    </div>
  );
}

export function HowItWorksPage() {
  const { t } = useI18n();
  return (
    <div className="pub-page">
      <PublicHero eyebrow={t('pub.how.eyebrow')} title={t('pub.how.title')} lead={t('pub.how.lead')} visual={<HeroArt kind="how" />} />
      <SimNote />
      <Section id="how-steps" title={t('pub.how.eyebrow')}>
        <Steps items={[1, 2, 3, 4, 5].map((n) => ({ title: `pub.how.s${n}t` as MessageKey, text: `pub.how.s${n}` as MessageKey }))} />
      </Section>
      <div className="two-col">
        <Section id="how-doctors" title={t('pub.how.doctorsTitle')}>
          <p>{t('pub.how.doctorsText')}</p>
          <Link to="/doctors" className="link-arrow">
            {t('pub.cta.learnMore')}
          </Link>
        </Section>
        <Section id="how-pharmacies" title={t('pub.how.pharmaciesTitle')}>
          <p>{t('pub.how.pharmaciesText')}</p>
          <Link to="/pharmacies" className="link-arrow">
            {t('pub.cta.learnMore')}
          </Link>
        </Section>
      </div>
      <Section id="how-faq" title={t('pub.faq.title')}>
        <Faq items={[FAQ_ALL[1], FAQ_ALL[3], FAQ_ALL[4], FAQ_ALL[5]]} />
      </Section>
      <CtaBand title={t('pub.home.ctaTitle')} text={t('pub.home.ctaText')} actions={<AccountCtas />} />
    </div>
  );
}

function RolePage({
  role,
  prefix,
  art,
  icons,
}: {
  role: 'patient' | 'pharmacy' | 'doctor';
  prefix: 'patients' | 'pharmacies' | 'doctors';
  art: 'patients' | 'pharmacies' | 'doctors';
  icons: ReactElement[];
}) {
  const { t } = useI18n();
  const k = (s: string) => `pub.${prefix}.${s}` as MessageKey;
  return (
    <div className="pub-page">
      <PublicHero
        eyebrow={t(k('eyebrow'))}
        title={t(k('title'))}
        lead={t(k('lead'))}
        visual={<HeroArt kind={art} />}
        actions={<AccountCtas role={role} />}
      />
      <Section id={`${prefix}-benefits`} title={t(k('eyebrow'))}>
        <FeatureGrid items={[1, 2, 3, 4].map((n, i) => ({ icon: icons[i], title: k(`b${n}t`), text: k(`b${n}`) }))} />
      </Section>
      <Section id={`${prefix}-steps`} title={t(k('stepsTitle'))}>
        <Steps items={[1, 2, 3, 4].map((n) => ({ text: k(`p${n}`) }))} />
      </Section>
      <SimNote />
      <CtaBand title={t('pub.home.ctaTitle')} text={t('pub.home.ctaText')} actions={<AccountCtas role={role} />} />
    </div>
  );
}

export const ForPatientsPage = () => (
  <RolePage
    role="patient"
    prefix="patients"
    art="patients"
    icons={[<IconSearch key="a" />, <IconMap key="b" />, <IconTruck key="c" />, <IconDoc key="d" />]}
  />
);
export const ForPharmaciesPage = () => (
  <RolePage
    role="pharmacy"
    prefix="pharmacies"
    art="pharmacies"
    icons={[<IconStore key="a" />, <IconList key="b" />, <IconClock key="c" />, <IconShield key="d" />]}
  />
);
export const ForDoctorsPage = () => (
  <RolePage
    role="doctor"
    prefix="doctors"
    art="doctors"
    icons={[<IconCheck key="a" />, <IconLock key="b" />, <IconDoc key="c" />, <IconList key="d" />]}
  />
);

export function AboutPage() {
  const { t } = useI18n();
  return (
    <div className="pub-page">
      <PublicHero
        eyebrow={t('pub.about.eyebrow')}
        title={t('pub.about.title')}
        lead={t('pub.about.lead')}
        visual={<HeroArt kind="about" />}
      />
      <div className="two-col">
        <Section id="about-mission" title={t('pub.about.missionTitle')}>
          <p>{t('pub.about.mission')}</p>
        </Section>
        <Section id="about-honest" title={t('pub.about.honestTitle')}>
          <p>
            <IconCheck width={18} height={18} /> {t('pub.about.real')}
          </p>
          <p className="muted">{t('pub.about.notReal')}</p>
        </Section>
      </div>
      <Section id="about-values" title={t('pub.about.valuesTitle')}>
        <FeatureGrid
          items={[
            { icon: <IconStore />, title: 'pub.about.v1t', text: 'pub.about.v1' },
            { icon: <IconChoice />, title: 'pub.about.v2t', text: 'pub.about.v2' },
            { icon: <IconCapsule />, title: 'pub.about.v3t', text: 'pub.about.v3' },
          ]}
        />
      </Section>
      <CtaBand
        title={t('pub.contact.title')}
        text={t('pub.contact.lead')}
        actions={
          <Link to="/contact" className="btn">
            {t('pub.cta.contact')}
          </Link>
        }
      />
    </div>
  );
}

export function FaqPage() {
  const { t } = useI18n();
  return (
    <div className="pub-page">
      <PublicHero eyebrow={t('pub.faq.eyebrow')} title={t('pub.faq.title')} lead={t('pub.faq.lead')} visual={<HeroArt kind="faq" />} />
      <Section id="faq-all" title={t('pub.faq.title')}>
        <Faq items={FAQ_ALL} />
      </Section>
      <SimNote />
    </div>
  );
}

function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { t } = useI18n();
  const k = (s: string) => `pub.${kind}.${s}` as MessageKey;
  return (
    <div className="pub-page legal-page">
      <PublicHero eyebrow={t('pub.footer.legal')} title={t(k('title'))} lead={t(k('lead'))} visual={<HeroArt kind="legal" />} />
      <article className="card glass stack legal-body">
        <p className="alert info" role="note">
          {t('pub.legal.banner')}
        </p>
        {[1, 2, 3, 4, 5].map((n) => (
          <section key={n} aria-labelledby={`${kind}-h${n}`}>
            <h2 id={`${kind}-h${n}`}>{t(k(`h${n}`))}</h2>
            <p>{t(k(`p${n}`))}</p>
          </section>
        ))}
        <p className="muted small">{t('pub.legal.updated')}</p>
      </article>
    </div>
  );
}
export const PrivacyPage = () => <LegalPage kind="privacy" />;
export const TermsPage = () => <LegalPage kind="terms" />;
