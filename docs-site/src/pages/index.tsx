import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

// ─── Feature cards ───────────────────────────────────────────────────────────

type FeatureItem = {
  emoji: string;
  title: string;
  description: ReactNode;
};

const FEATURES: FeatureItem[] = [
  {
    emoji: '🦀',
    title: 'Rust core, every platform',
    description: (
      <>
        Stellar crypto, XDR encoding, and blockchain sync are written once in
        Rust and shipped as WebAssembly, a C-ABI shared library, and native
        crates — so you get the same correctness on every platform without
        reimplementing anything.
      </>
    ),
  },
  {
    emoji: '🌊',
    title: 'Real-time blockchain sync',
    description: (
      <>
        <code>echomirror-sync</code> streams Stellar events over SSE with
        resumable cursors, automatic reconnect, gap backfill, and exactly-once
        delivery. Works in Rust and Flutter.
      </>
    ),
  },
  {
    emoji: '💛',
    title: 'Mood × Stellar payments',
    description: (
      <>
        Log moods, earn streaks, and gift ECHO tokens — all in one SDK. The
        social feed, leaderboard, and Freighter / Albedo wallet integrations
        are a single import away.
      </>
    ),
  },
  {
    emoji: '🧩',
    title: 'Pick only what you need',
    description: (
      <>
        Each language binding is independently publishable. Use{' '}
        <code>@echomirror/stellar</code> alone for Stellar payments, or{' '}
        <code>@echomirror/analytics</code> standalone for UX event tracking —
        no need to take the full SDK.
      </>
    ),
  },
  {
    emoji: '⚡',
    title: 'Drop-in React integration',
    description: (
      <>
        <code>EchoMirrorProvider</code>, <code>useMoodStreak</code>, and{' '}
        <code>MoodWidget</code> let you add a floating mood widget and live
        balance to any React app in minutes.
      </>
    ),
  },
  {
    emoji: '🔌',
    title: 'VS Code + browser extensions',
    description: (
      <>
        A VS Code extension puts live ECHO balance, Friendbot, and the Sync
        Explorer in your editor. The Chrome extension injects the mood widget
        and watches Stellar transactions on any site.
      </>
    ),
  },
];

function FeatureCard({ emoji, title, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.featureCard)}>
      <div className={styles.featureEmoji} role="img" aria-label={title}>
        {emoji}
      </div>
      <Heading as="h3">{title}</Heading>
      <p>{description}</p>
    </div>
  );
}

// ─── Platform quickstart tiles ───────────────────────────────────────────────

type PlatformItem = {
  label: string;
  to: string;
  install: string;
};

const PLATFORMS: PlatformItem[] = [
  { label: 'React', to: '/docs/quickstart/react', install: 'npm i @echomirror/react' },
  { label: 'JavaScript', to: '/docs/quickstart/javascript', install: 'npm i @echomirror/core' },
  { label: 'Flutter', to: '/docs/quickstart/flutter', install: 'pub add echomirror_sdk' },
  { label: 'Rust', to: '/docs/quickstart/rust', install: 'cargo add echomirror-core' },
  { label: 'Python', to: '/docs/quickstart/python', install: 'pip install echomirror-sdk' },
  { label: 'Swift', to: '/docs/quickstart/swift', install: 'SPM: EchoMirrorSDK' },
];

function PlatformTile({ label, to, install }: PlatformItem) {
  return (
    <Link to={to} className={styles.platformTile}>
      <span className={styles.platformLabel}>{label}</span>
      <code className={styles.platformInstall}>{install}</code>
    </Link>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={styles.hero}>
      <div className="container">
        <div className={styles.heroBadge}>Rust · WASM · FFI · TypeScript · Flutter · Swift · Python</div>
        <Heading as="h1" className={styles.heroTitle}>
          {siteConfig.title}
        </Heading>
        <p className={styles.heroSubtitle}>
          Mood intelligence, Stellar payments, and social wellness for every platform and language.
          One Rust core — shipped as WebAssembly, C-ABI, and native crates.
        </p>

        <div className={styles.heroCta}>
          <Link className="button button--primary button--lg" to="/docs/architecture">
            How the SDK fits together →
          </Link>
          <Link className="button button--outline button--lg" to="/docs/intro">
            Get started
          </Link>
        </div>

        <div className={styles.platformGrid}>
          {PLATFORMS.map((p) => (
            <PlatformTile key={p.label} {...p} />
          ))}
        </div>
      </div>
    </header>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Mood intelligence, Stellar payments, and social wellness SDK for React, Flutter, Swift, Python, and Rust."
    >
      <Hero />

      <main>
        {/* Architecture callout */}
        <section className={styles.archCallout}>
          <div className="container">
            <div className={styles.archCalloutInner}>
              <div>
                <Heading as="h2" className={styles.archCalloutHeading}>
                  Not sure where to start?
                </Heading>
                <p className={styles.archCalloutText}>
                  The Architecture page shows the full dependency graph — which Rust crates compile
                  to which targets, how language bindings consume them, and a decision guide for
                  every platform.
                </p>
              </div>
              <Link className="button button--primary button--lg" to="/docs/architecture">
                View architecture &amp; package guide →
              </Link>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className={styles.features}>
          <div className="container">
            <Heading as="h2" className={styles.sectionHeading}>
              What's included
            </Heading>
            <div className="row">
              {FEATURES.map((props, idx) => (
                <FeatureCard key={idx} {...props} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
