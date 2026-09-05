import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import useBaseUrl from '@docusaurus/useBaseUrl';
import InstallPlayground from '@site/src/components/InstallPlayground';
import styles from './index.module.css';

type IconName = 'smile' | 'sparkles' | 'users' | 'cpu' | 'atom' | 'star' | 'heart' | 'bar-chart' | 'refresh' | 'arrow-right' | 'arrow-up-right';

/**
 * Small hand-authored icon set in Lucide's stroke-based visual language
 * (24x24 viewBox, round joins, currentColor) — real iconography standing in
 * for the emoji/unicode-glyph placeholders this page used to ship with.
 */
function Icon({name, className}: {name: IconName; className?: string}) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  switch (name) {
    case 'smile':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M8.2 13.2c.9 1.6 2.2 2.4 3.8 2.4s2.9-.8 3.8-2.4" /><path d="M8.6 9.4h.01" /><path d="M15.4 9.4h.01" /></svg>;
    case 'sparkles':
      return <svg {...common}><path d="M11.2 3.5 12.6 8l4.5 1.4-4.5 1.4-1.4 4.5-1.4-4.5-4.5-1.4 4.5-1.4Z" /><path d="M18.6 15.6 19.3 18l2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7 2.4-.7Z" /></svg>;
    case 'users':
      return <svg {...common}><path d="M17 20v-1.6a3.6 3.6 0 0 0-3.6-3.6H7.6A3.6 3.6 0 0 0 4 18.4V20" /><circle cx="10.4" cy="7.4" r="3.4" /><path d="M19.6 20v-1.6a3.6 3.6 0 0 0-2.4-3.39" /><path d="M14.8 4.1a3.4 3.4 0 0 1 0 6.6" /></svg>;
    case 'cpu':
      return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="1.5" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /><rect x="9.5" y="9.5" width="5" height="5" rx=".5" /></svg>;
    case 'atom':
      return <svg {...common}><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><ellipse cx="12" cy="12" rx="9" ry="3.6" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)" /></svg>;
    case 'star':
      return <svg {...common}><path d="M12 3.2 14.6 9l6.2.6-4.7 4.1 1.4 6.1L12 16.7 6.5 19.8l1.4-6.1-4.7-4.1L9.4 9Z" /></svg>;
    case 'heart':
      return <svg {...common}><path d="M12 20.2s-7.8-4.6-9.9-9.5C.6 6.9 3 3.6 6.5 3.6c2 0 3.7 1.1 4.5 2.7.8-1.6 2.5-2.7 4.5-2.7 3.5 0 5.9 3.3 4.4 7.1-2.1 4.9-9.9 9.5-9.9 9.5Z" /></svg>;
    case 'bar-chart':
      return <svg {...common}><path d="M4 20V10M12 20V4M20 20v-7" /><path d="M4 20h16" strokeOpacity=".5" /></svg>;
    case 'refresh':
      return <svg {...common}><path d="M20 11a8 8 0 0 0-14.6-4.5M4 5v5h5" /><path d="M4 13a8 8 0 0 0 14.6 4.5M20 19v-5h-5" /></svg>;
    case 'arrow-right':
      return <svg {...common}><path d="M4 12h16M14 6l6 6-6 6" /></svg>;
    case 'arrow-up-right':
      return <svg {...common}><path d="M7 17 17 7M8 7h9v9" /></svg>;
  }
}

type Package = {name: string; label: string; description: string; tone: string; icon: IconName};
const PACKAGES: Package[] = [
  {name: '@echomirror/core', label: 'CORE', description: 'Typed client primitives, retries, middleware, and shared configuration.', tone: 'mint', icon: 'cpu'},
  {name: '@echomirror/react', label: 'REACT', description: 'Provider, hooks, and MoodWidget components for product teams.', tone: 'peach', icon: 'atom'},
  {name: '@echomirror/stellar', label: 'STELLAR', description: 'Wallet connections, payments, balances, and Soroban-ready flows.', tone: 'lilac', icon: 'star'},
  {name: '@echomirror/social', label: 'SOCIAL', description: 'Feeds, reactions, leaderboards, and wellness-first community signals.', tone: 'sky', icon: 'users'},
  {name: '@echomirror/analytics', label: 'ANALYTICS', description: 'Privacy-conscious events that help teams understand engagement.', tone: 'gold', icon: 'bar-chart'},
  {name: 'echomirror-sync', label: 'SYNC', description: 'Resumable event streaming with cursors, reconnects, and backfill.', tone: 'coral', icon: 'refresh'},
];

function Mark() { return <span className={styles.mark} aria-hidden="true">E</span>; }

type Photo = {src: string; alt: string; tag: string; caption: string; credit: string};
const PHOTOS: Photo[] = [
  {
    src: '/img/photos/connection.jpg',
    alt: 'A crowd of friends laughing together at an outdoor evening gathering',
    tag: 'SOCIAL WELLNESS',
    caption: 'Feeds and reactions built around real moments, not vanity metrics.',
    credit: 'Samantha Gades',
  },
  {
    src: '/img/photos/mood.jpg',
    alt: 'A hand sketching in a lined notebook, mid check-in',
    tag: 'MOOD CHECK-IN',
    caption: 'A two-second log that turns into a pattern worth noticing.',
    credit: 'Seljan Salimova',
  },
  {
    src: '/img/photos/generosity.jpg',
    alt: 'A circle of hands stacked together in a group huddle',
    tag: 'STELLAR GENEROSITY',
    caption: 'Payments that read as a gesture of care, settled on-chain.',
    credit: 'Hannah Busing',
  },
];

function PhotoBand(): ReactNode {
  const urls = [useBaseUrl(PHOTOS[0].src), useBaseUrl(PHOTOS[1].src), useBaseUrl(PHOTOS[2].src)];
  return <section className={styles.photoBand} aria-labelledby="photo-band-title">
    <div className={styles.grainSoft} aria-hidden="true" />
    <div className="container" style={{position: 'relative', zIndex: 1}}>
      <div className={styles.photoBandHeader}>
        <p className={styles.kicker} style={{color: 'var(--ifm-color-primary)'}}><span /> Not an abstraction</p>
        <Heading as="h2" id="photo-band-title">People, not just payloads.</Heading>
        <p className={styles.sectionLead}>Every event this SDK ships eventually reaches a person having an actual moment — so we designed around that, instead of around the JSON.</p>
      </div>
      <div className={styles.photoGrid}>
        {PHOTOS.map((photo, i) => <figure className={styles.photoCard} key={photo.src} data-tilt={i}>
          <img src={urls[i]} alt={photo.alt} loading="lazy" />
          <div className={styles.photoDuotone} aria-hidden="true" />
          <figcaption className={styles.photoCaption}>
            <small>{photo.tag}</small>
            <p>{photo.caption}</p>
          </figcaption>
        </figure>)}
      </div>
      <p className={styles.photoCredits}>Photos via Unsplash — {PHOTOS.map((p) => p.credit).join(', ')}.</p>
    </div>
  </section>;
}

function Hero(): ReactNode {
  return <header className={styles.hero}>
    <div className={styles.grain} aria-hidden="true" />
    <div className="container">
      <nav className={styles.heroNav} aria-label="Landing page navigation"><Link to="/" className={styles.brand}><Mark /> EchoMirror</Link><div className={styles.navLinks}><Link to="/docs/intro">Docs</Link><a href="https://github.com/Echo-Mirror-Butler/echomirror-sdk">GitHub <Icon name="arrow-up-right" className={styles.inlineIcon} /></a></div></nav>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><span /> Open-source SDK for social wellness</p>
          <Heading as="h1">Build products that understand <em>how people feel.</em></Heading>
          <p className={styles.heroLead}>EchoMirror brings mood intelligence, Stellar payments, and social wellness into one composable SDK—so a check-in can become a healthier habit, a generous moment, or a connected community.</p>
          <div className={styles.ctaRow}><Link className="button button--primary button--lg" to="/docs/quickstart/react">Start with React <Icon name="arrow-right" className={styles.inlineIcon} /></Link><a className={styles.textCta} href="https://github.com/Echo-Mirror-Butler/echomirror-sdk">Explore on GitHub <Icon name="arrow-up-right" className={styles.inlineIcon} /></a></div>
          <div className={styles.trustRow} aria-label="Repository facts"><div><strong>26</strong><span>contributors</span></div><div><strong>7</strong><span>JS packages</span></div><div><strong>Rust-first</strong><span>cross-platform core</span></div></div>
        </div>
        <div className={styles.heroArt} aria-label="Illustration showing a mood check-in connected to a Stellar payment and social feed" role="img">
          <div className={`${styles.orbit} ${styles.orbitOne}`} /><div className={`${styles.orbit} ${styles.orbitTwo}`} />
          <div className={styles.signalCard}><span className={styles.signalIcon}><Icon name="smile" /></span><span><small>MOOD SIGNAL</small><strong>Feeling good</strong></span><b>+18%</b></div>
          <div className={styles.centerOrb}><Mark /><span>human<br />connection</span></div>
          <div className={`${styles.floatCard} ${styles.paymentCard}`}><span><Icon name="sparkles" /></span><div><small>STELLAR PAYMENT</small><strong>+ 12.50 ECHO</strong></div></div>
          <div className={`${styles.floatCard} ${styles.socialCard}`}><span><Icon name="heart" /></span><div><small>SOCIAL WELLNESS</small><strong>4 day streak</strong></div></div>
        </div>
      </div>
    </div>
  </header>;
}

export default function Home(): ReactNode {
  return <Layout title="Mood intelligence for every app" description="Build social wellness products with mood intelligence, Stellar payments, and real-time sync.">
    <Hero />
    <main>
      <section className={styles.introSection}><div className="container introGrid"><div><p className={styles.kicker}>One SDK, many ways to care</p><Heading as="h2">The infrastructure for <span className={styles.highlight}>human-centered</span> apps.</Heading></div><p className={styles.sectionLead}>From the first mood check-in to the moment a community gives back, EchoMirror gives developers the building blocks to make wellbeing feel native—not bolted on.</p></div></section>
      <PhotoBand />
      <section className={styles.packageSection} aria-labelledby="packages-title">
        <div className={styles.grainSoft} aria-hidden="true" />
        <div className="container" style={{position: 'relative', zIndex: 1}}><div className={styles.sectionHeader}><div><p className={styles.kicker}>Composable by design</p><Heading as="h2" id="packages-title">Pick your starting point.</Heading></div><Link to="/docs/architecture" className={styles.outlineLink}>See the architecture <Icon name="arrow-right" className={styles.inlineIcon} /></Link></div><div className={styles.packageGrid}>{PACKAGES.map((pkg) => <article className={`${styles.packageCard} ${pkg.name === '@echomirror/stellar' ? styles.packageCardFeatured : ''}`} key={pkg.name}><div className={`${styles.packageIcon} ${styles[pkg.tone]}`} aria-hidden="true"><Icon name={pkg.icon} /></div><p className={styles.packageLabel}>{pkg.label}</p><h3>{pkg.name}</h3><p>{pkg.description}</p><Link to={pkg.name === '@echomirror/react' ? '/docs/quickstart/react' : '/docs/architecture'} aria-label={`Learn about ${pkg.name}`}>Learn more <Icon name="arrow-up-right" className={styles.inlineIcon} /></Link></article>)}</div></div>
      </section>
      <InstallPlayground />
      <section className={styles.finalCta}><div className="container"><div><p className={styles.kicker}>Ready when you are</p><Heading as="h2">Make room for better moments.</Heading><p>Read the quickstart, bring your own product context, and help shape the next layer of social wellness infrastructure.</p></div><Link className="button button--primary button--lg" to="/docs/intro">Read the quickstart <Icon name="arrow-right" className={styles.inlineIcon} /></Link></div></section>
    </main>
  </Layout>;
}
