# The Autonomous AI Company Landing

Pixel-preserved implementation of the Claude design handoff in `autonomousai.company.zip`.

## Development

```bash
npm install
npm run dev
```

Open the local URL Vite prints. The root page is `public/index.html`; it intentionally preserves the handoff runtime and inline design source.

## Verification

```bash
npm run verify
```

This runs static contract tests, builds the deployable `dist/` folder, and checks the live page with Playwright.

## Deployment

The deployable artifact is `dist/`. It is static and can be uploaded directly to `dante.host`.
