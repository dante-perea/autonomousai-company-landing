# The Autonomous AI Company Landing

The public founding thesis for [autonomousai.company](https://autonomousai.company).

The landing page explains the progression from companies with fewer people to companies with zero standing employees, the applications and research layers, the role of verification, and the authority retained by the AI Native Founder.

## Development

```bash
npm install
npm run dev
```

Open the local URL Vite prints. The root page is `public/index.html`, with its visual system in `public/styles.css` and small progressive enhancements in `public/site.js`.

## Verification

```bash
npm run verify
```

This runs static contract tests, builds the deployable `dist/` folder, and checks the page at desktop and mobile sizes with Playwright.

## Deployment

The deployable artifact is `dist/`. Vercel deploys the production site from the repository.

The previous handoff remains recoverable from Git history. Its unused CDN runtime is not included in the production artifact.
