# React Example

This app exercises the published `@echomirror/react`, `@echomirror/mood`,
`@echomirror/social`, `@echomirror/stellar`, and `@echomirror/wasm` packages.

From this directory, install and build:

```bash
npm install
npm run build
```

To run it locally, create `.env.local` in this directory and set your API key:

```bash
printf 'VITE_ECHOMIRROR_API_KEY=your_api_key\n' > .env.local
npm run dev
```

Open the local URL printed by Vite. The mood, feed, leaderboard, and balance
requests require a valid EchoMirror API key; wallet connection also requires a
compatible Stellar wallet such as Freighter.