# The Autonomous AI Company Landing

The public home of [autonomousai.company](https://autonomousai.company).

The root landing page is a concise introduction to the company. The complete founder thesis is published as a whitepaper at `/thesis/`. Its cinematic proof engine uses one GSAP-controlled narrative state across semantic DOM, SVG, and a custom WebGL2 field, with WebGL1 and composed CSS fallbacks.

## Development

```bash
npm install
npm run dev
```

Open the local URL Vite prints. The root page is `public/index.html`; the whitepaper is `public/thesis/index.html`; the visual system is `public/styles.css`; and the GPU field is isolated in `public/gpu-background.js`.

## Verification

```bash
npm run verify
```

This runs static contract tests, builds the deployable `dist/` folder, and checks both the landing page and whitepaper in desktop Chromium, desktop WebKit, and mobile Safari profiles with Playwright and Axe.

## Deployment

The deployable artifact is `dist/`. Vercel deploys the production site from the repository.

The previous handoff remains recoverable from Git history. Its unused CDN runtime is not included in the production artifact.
