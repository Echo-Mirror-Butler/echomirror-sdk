// Source of truth for the extension manifest.
//
// It lives here rather than in a checked-in manifest.json so every permission
// can carry the justification Chrome Web Store review asks for — JSON itself
// has no comments. `npm run build` serialises this object to dist/manifest.json.

export const API_ORIGIN = 'https://api.echomirror.dev'

/** @type {Record<string, unknown>} */
export const manifest = {
  manifest_version: 3,
  name: 'EchoMirror — Mood Check-in',
  version: '0.1.0',
  description:
    'Log how you are feeling in two clicks and get a gentle daily reminder if you have not checked in yet.',

  // Justification for every requested permission. The extension asks for
  // nothing beyond these three — no tabs, no scripting, no content scripts.
  permissions: [
    // storage: persists the API key, reminder preferences and the local
    // "already logged today" marker in chrome.storage.local. Service workers
    // are torn down between events, so nothing can be kept in memory and
    // localStorage is not available to them.
    'storage',
    // alarms: wakes the (otherwise suspended) service worker at the user's
    // configured reminder time. setTimeout does not survive worker suspension.
    'alarms',
    // notifications: the reminder itself — a single system notification when
    // the user has not logged a mood by their chosen time.
    'notifications',
  ],

  // Only the EchoMirror API. Mood entries are read from and written to this
  // origin via the @echomirror/core client; no other host is contacted.
  host_permissions: [`${API_ORIGIN}/*`],

  action: {
    default_popup: 'popup.html',
    default_title: 'EchoMirror — log your mood',
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },

  options_ui: {
    page: 'options.html',
    open_in_tab: true,
  },

  background: {
    service_worker: 'background.js',
    type: 'module',
  },

  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },

  // MV3 forbids remote code. Every script is bundled into the package and
  // loaded from 'self'; this policy makes that explicit and blocks eval.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; base-uri 'self'",
  },

  minimum_chrome_version: '116',
}

export default manifest
