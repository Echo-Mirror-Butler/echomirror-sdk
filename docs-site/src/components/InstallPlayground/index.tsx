import type {ReactNode} from 'react';
import {useState} from 'react';
import styles from './styles.module.css';

type InstallTab = {
  id: string;
  label: string;
  command: string;
};

const INSTALL_TABS: InstallTab[] = [
  {id: 'npm', label: 'npm', command: 'npm install @echomirror/react'},
  {id: 'pnpm', label: 'pnpm', command: 'pnpm add @echomirror/react'},
  {id: 'yarn', label: 'yarn', command: 'yarn add @echomirror/react'},
];

const STARTER_CODE = `import { MoodWidget } from '@echomirror/react';

export default function App() {
  return <MoodWidget userId="demo-user" />;
}`;

export default function InstallPlayground(): ReactNode {
  const [activeTab, setActiveTab] = useState('npm');
  const [code, setCode] = useState(STARTER_CODE);
  const selectedTab = INSTALL_TABS.find((tab) => tab.id === activeTab) ?? INSTALL_TABS[0];

  return (
    <section className={styles.section} aria-labelledby="playground-title">
      <div className="container">
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Try the integration</span>
          <h2 id="playground-title">A mood widget in one component</h2>
          <p>Install the React package, edit the example, and see the shape of the experience before you open your editor.</p>
        </div>
        <div className={styles.playground}>
          <div className={styles.editorPanel}>
            <div className={styles.panelHeader}>
              <span>Install in your framework</span>
              <span className={styles.liveLabel}><span aria-hidden="true" /> Live example</span>
            </div>
            <div className={styles.tabs} role="tablist" aria-label="Package manager">
              {INSTALL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={styles.tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className={styles.command} aria-live="polite">
              <code>{selectedTab.command}</code>
              <button type="button" className={styles.copyButton} onClick={() => navigator.clipboard?.writeText(selectedTab.command)} aria-label={`Copy ${selectedTab.label} install command`}>Copy</button>
            </div>
            <label className={styles.editorLabel} htmlFor="mood-playground-code">Edit the component</label>
            <textarea id="mood-playground-code" className={styles.editor} value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} aria-describedby="playground-hint" />
            <p id="playground-hint" className={styles.hint}>This browser preview is a safe visual sandbox; the same component runs against your SDK configuration.</p>
          </div>
          <div className={styles.previewPanel}>
            <div className={styles.panelHeader}><span>Preview</span><span className={styles.previewDot}>● synced</span></div>
            <div className={styles.previewStage}>
              <div className={styles.mockApp}>
                <div className={styles.mockNav}><span className={styles.mockMark}>E</span><span>your app</span><span className={styles.mockAvatar}>JD</span></div>
                <div className={styles.mockContent}><span className={styles.mockKicker}>TODAY'S CHECK-IN</span><strong>How are you feeling?</strong><span className={styles.moodOptions} aria-label="Mood options">😌 &nbsp;🙂 &nbsp;⚡ &nbsp;🌧️</span></div>
                <div className={styles.widget}><div className={styles.widgetTop}><span className={styles.widgetIcon}>◒</span><span>MoodWidget</span><span aria-hidden="true">×</span></div><strong>Good momentum</strong><p>Your streak is at 4 days.</p><button type="button">Log today’s mood</button></div>
              </div>
            </div>
            <div className={styles.previewFooter}><span>React 19</span><span>Accessible by default</span><span>Stellar-ready</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
