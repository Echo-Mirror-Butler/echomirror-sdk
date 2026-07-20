export const WIDGET_CSS = `
.emw {
  --emw-radius: 12px;
  --emw-spacing: 8px;
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 420px;
  padding: calc(var(--emw-spacing) * 2.5);
  border-radius: var(--emw-radius);
  background: var(--emw-color-bg);
  color: var(--emw-color-text);
  font-family: var(--emw-font-family);
  font-size: var(--emw-font-size);
  line-height: 1.45;
  border: 1px solid var(--emw-color-border);
}
.emw *, .emw *::before, .emw *::after { box-sizing: border-box; }

.emw__title {
  margin: 0 0 calc(var(--emw-spacing) * 1.5);
  font-size: 1.15em;
  font-weight: var(--emw-font-weight-bold);
}

.emw__label {
  display: block;
  font-weight: var(--emw-font-weight-medium);
  margin-bottom: var(--emw-spacing);
  color: var(--emw-color-text);
}

.emw__current {
  float: right;
  font-weight: var(--emw-font-weight-bold);
  color: var(--emw-color-primary);
}

.emw__picker {
  display: flex;
  gap: var(--emw-spacing);
  margin: 0 0 calc(var(--emw-spacing) * 2);
  flex-wrap: wrap;
}

.emw__score {
  flex: 1 1 0;
  min-width: 34px;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25em;
  line-height: 1;
  border-radius: calc(var(--emw-radius) * 0.75);
  border: 1px solid var(--emw-color-border);
  background: var(--emw-color-surface);
  color: var(--emw-color-text);
  cursor: pointer;
  transition: transform .08s ease, background .12s ease, border-color .12s ease;
  padding: 0;
}
.emw__score:hover { border-color: var(--emw-color-primary); }
.emw__score:active { transform: scale(.94); }
.emw__score[aria-checked="true"] {
  background: var(--emw-color-primary);
  color: var(--emw-color-primary-contrast);
  border-color: var(--emw-color-primary);
}
.emw__score:focus-visible {
  outline: 3px solid var(--emw-color-ring);
  outline-offset: 2px;
}

.emw__note {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  padding: var(--emw-spacing);
  border-radius: calc(var(--emw-radius) * 0.75);
  border: 1px solid var(--emw-color-border);
  background: var(--emw-color-surface);
  color: var(--emw-color-text);
  font: inherit;
  margin-bottom: calc(var(--emw-spacing) * 2);
}
.emw__note:focus-visible {
  outline: 3px solid var(--emw-color-ring);
  outline-offset: 2px;
}

.emw__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--emw-spacing);
  margin-bottom: calc(var(--emw-spacing) * 2);
}
.emw__tag {
  padding: calc(var(--emw-spacing) * 0.5) calc(var(--emw-spacing) * 1.25);
  border-radius: 999px;
  border: 1px solid var(--emw-color-border);
  background: var(--emw-color-surface);
  color: var(--emw-color-text-muted);
  font: inherit;
  font-size: .9em;
  cursor: pointer;
}
.emw__tag[aria-pressed="true"] {
  background: var(--emw-color-primary);
  color: var(--emw-color-primary-contrast);
  border-color: var(--emw-color-primary);
}
.emw__tag:focus-visible {
  outline: 3px solid var(--emw-color-ring);
  outline-offset: 2px;
}

.emw__submit {
  width: 100%;
  padding: calc(var(--emw-spacing) * 1.25);
  border: none;
  border-radius: calc(var(--emw-radius) * 0.75);
  background: var(--emw-color-primary);
  color: var(--emw-color-primary-contrast);
  font: inherit;
  font-weight: var(--emw-font-weight-bold);
  cursor: pointer;
  transition: opacity .12s ease;
}
.emw__submit:hover:not(:disabled) { opacity: .92; }
.emw__submit:disabled { opacity: .6; cursor: progress; }
.emw__submit:focus-visible {
  outline: 3px solid var(--emw-color-ring);
  outline-offset: 2px;
}

.emw__status {
  margin-top: calc(var(--emw-spacing) * 1.5);
  font-size: .92em;
  min-height: 1.2em;
}
.emw__status--submitting { color: var(--emw-color-text-muted); }
.emw__status--success { color: var(--emw-color-success); }
.emw__status--error { color: var(--emw-color-error); }

.emw__panel {
  margin-top: calc(var(--emw-spacing) * 1.5);
  padding: calc(var(--emw-spacing) * 1.5);
  border-radius: calc(var(--emw-radius) * 0.75);
  background: var(--emw-color-success-bg);
  color: var(--emw-color-text);
}
.emw__panel--error { background: var(--emw-color-error-bg); }
.emw__panel-title {
  margin: 0 0 var(--emw-spacing);
  font-weight: var(--emw-font-weight-bold);
  display: flex;
  align-items: center;
  gap: var(--emw-spacing);
}
.emw__panel-emoji { font-size: 1.6em; line-height: 1; }
.emw__panel-note { color: var(--emw-color-text-muted); margin: 0 0 var(--emw-spacing); white-space: pre-wrap; }
.emw__panel-actions { display: flex; gap: var(--emw-spacing); margin-top: var(--emw-spacing); }
.emw__link {
  background: none;
  border: 1px solid var(--emw-color-border);
  border-radius: calc(var(--emw-radius) * 0.75);
  padding: calc(var(--emw-spacing) * 0.75) calc(var(--emw-spacing) * 1.5);
  font: inherit;
  font-weight: var(--emw-font-weight-medium);
  color: var(--emw-color-text);
  cursor: pointer;
}
.emw__link:focus-visible { outline: 3px solid var(--emw-color-ring); outline-offset: 2px; }

.emw__sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .emw *, .emw *::before, .emw *::after { transition: none !important; }
}

@media (forced-colors: active) {
  .emw__score[aria-checked="true"] { outline: 2px solid CanvasText; }
}
`
