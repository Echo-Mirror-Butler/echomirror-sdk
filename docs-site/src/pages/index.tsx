import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import InstallPlayground from '@site/src/components/InstallPlayground';
import styles from './index.module.css';

type Package = {name: string; label: string; description: string; tone: string};
const PACKAGES: Package[] = [
  {name: '@echomirror/core', label: 'CORE', description: 'Typed client primitives, retries, middleware, and shared configuration.', tone: 'mint'},
  {name: '@echomirror/react', label: 'REACT', description: 'Provider, hooks, and MoodWidget components for product teams.', tone: 'peach'},
  {name: '@echomirror/stellar', label: 'STELLAR', description: 'Wallet connections, payments, balances, and Soroban-ready flows.', tone: 'lilac'},
  {name: '@echomirror/social', label: 'SOCIAL', description: 'Feeds, reactions, leaderboards, and wellness-first community signals.', tone: 'sky'},
  {name: '@echomirror/analytics', label: 'ANALYTICS', description: 'Privacy-conscious events that help teams understand engagement.', tone: 'gold'},
  {name: 'echomirror-sync', label: 'SYNC', description: 'Resumable event streaming with cursors, reconnects, and backfill.', tone: 'coral'},
];

function Mark() { return <span className={styles.mark} aria-hidden="true">E</span>; }

function Hero(): ReactNode {
  return <header className={styles.hero}>
    <div className="container">
      <nav className={styles.heroNav} aria-label="Landing page navigation"><Link to="/" className={styles.brand}><Mark /> EchoMirror</Link><div className={styles.navLinks}><Link to="/docs/intro">Docs</Link><a href="https://github.com/Echo-Mirror-Butler/echomirror-sdk">GitHub ↗</a></div></nav>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}><span /> Open-source SDK for social wellness</p>
          <Heading as="h1">Build products that understand <em>how people feel.</em></Heading>
          <p className={styles.heroLead}>EchoMirror brings mood intelligence, Stellar payments, and social wellness into one composable SDK—so a check-in can become a healthier habit, a generous moment, or a connected community.</p>
          <div className={styles.ctaRow}><Link className="button button--primary button--lg" to="/docs/quickstart/react">Start with React <span aria-hidden="true">→</span></Link><a className={styles.textCta} href="https://github.com/Echo-Mirror-Butler/echomirror-sdk">Explore on GitHub <span aria-hidden="true">↗</span></a></div>
          <div className={styles.trustRow} aria-label="Repository facts"><div><strong>26</strong><span>contributors</span></div><div><strong>7</strong><span>JS packages</span></div><div><strong>Rust-first</strong><span>cross-platform core</span></div></div>
        </div>
        <div className={styles.heroArt} aria-label="Illustration showing a mood check-in connected to a Stellar payment and social feed" role="img"><div className={`${styles.orbit} ${styles.orbitOne}`} /><div className={`${styles.orbit} ${styles.orbitTwo}`} /><div className={styles.signalCard}><span className={styles.signalIcon}>◒</span><span><small>MOOD SIGNAL</small><strong>Feeling good</strong></span><b>+18%</b></div><div className={styles.centerOrb}><Mark /><span>human<br />connection</span></div><div className={`${styles.floatCard} ${styles.paymentCard}`}><span>✦</span><div><small>STELLAR PAYMENT</small><strong>+ 12.50 ECHO</strong></div></div><div className={`${styles.floatCard} ${styles.socialCard}`}><span>◎</span><div><small>SOCIAL WELLNESS</small><strong>4 day streak</strong></div></div></div>
      </div>
    </div>
  </header>;
}

export default function Home(): ReactNode {
  return <Layout title="Mood intelligence for every app" description="Build social wellness products with mood intelligence, Stellar payments, and real-time sync.">
    <Hero />
    <main>
      <section className={styles.introSection}><div className="container introGrid"><div><p className={styles.kicker}>One SDK, many ways to care</p><Heading as="h2">The infrastructure for <span className={styles.highlight}>human-centered</span> apps.</Heading></div><p className={styles.sectionLead}>From the first mood check-in to the moment a community gives back, EchoMirror gives developers the building blocks to make wellbeing feel native—not bolted on.</p></div></section>
      <section className={styles.packageSection} aria-labelledby="packages-title"><div className="container"><div className={styles.sectionHeader}><div><p className={styles.kicker}>Composable by design</p><Heading as="h2" id="packages-title">Pick your starting point.</Heading></div><Link to="/docs/architecture" className={styles.outlineLink}>See the architecture <span aria-hidden="true">→</span></Link></div><div className={styles.packageGrid}>{PACKAGES.map((pkg, index) => <article className={styles.packageCard} key={pkg.name}><div className={`${styles.packageIcon} ${styles[pkg.tone]}`} aria-hidden="true">{String(index + 1).padStart(2, '0')}</div><p className={styles.packageLabel}>{pkg.label}</p><h3>{pkg.name}</h3><p>{pkg.description}</p><Link to={pkg.name === '@echomirror/react' ? '/docs/quickstart/react' : '/docs/architecture'} aria-label={`Learn about ${pkg.name}`}>Learn more <span aria-hidden="true">↗</span></Link></article>)}</div></div></section>
      <InstallPlayground />
      <section className={styles.finalCta}><div className="container"><div><p className={styles.kicker}>Ready when you are</p><Heading as="h2">Make room for better moments.</Heading><p>Read the quickstart, bring your own product context, and help shape the next layer of social wellness infrastructure.</p></div><Link className="button button--primary button--lg" to="/docs/intro">Read the quickstart <span aria-hidden="true">→</span></Link></div></section>
    </main>
  </Layout>;
}
