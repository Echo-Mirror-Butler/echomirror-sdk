# Vanilla JavaScript Example

This Vite-powered page uses the published `@echomirror/core` client and
`@echomirror/mood` API directly, without a UI framework.

From this directory, install and build:

```bash
npm install
npm run build
```

Create `.env.local` with your API key, then start the page:

```bash
printf 'VITE_ECHOMIRROR_API_KEY=your_api_key\nVITE_ECHOMIRROR_BASE_URL=https://api.echomirror.dev/v1\n' > .env.local
npm run dev
```

Open the local URL printed by Vite and submit a mood. The base URL is optional;
the SDK uses `https://api.echomirror.dev/v1` by default. Vite embeds `VITE_`
variables in browser code, so use a key intended for client-side applications.