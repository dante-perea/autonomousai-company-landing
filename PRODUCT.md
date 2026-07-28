# Product

## Register

brand

## Users

AI-native founders, operators, research partners, and technically literate readers encountering The Autonomous AI Company for the first time. They need to understand the company's thesis, the sequence from autonomous companies to contract research organizations and labs, and the human accountability boundary.

## Product Purpose

Introduce The Autonomous AI Company succinctly, then make Dante Perea's complete argument available as a dedicated whitepaper. The thesis is that AI changes the mechanism by which companies create value: first by closing execution-validation loops in applications, then by making scientific verification cheaper, faster, and increasingly autonomous. Explain that "zero people" means zero standing employees, not zero human value or zero accountability. Success is a visitor who understands the company in one screen and can choose to read the complete founder thesis.

## Brand Personality

Provocative, rigorous, accountable. The voice is founder-owned and intellectually ambitious without becoming anonymous futurist marketing. Claims should be stated precisely, with the distinction between demonstrated capability, declared ambition, and the founder's inference kept visible.

## Anti-references

- Generic AI SaaS pages built from feature cards, glowing dashboards, and vague automation claims.
- Singularity worship that substitutes famous names, fake GPU counters, or inevitability rhetoric for the company's thesis.
- Copy that celebrates removing people or implies that human judgment and accountability disappear.
- Anonymous compression that rewrites Dante's argument into a different, safer, or more marketable thesis.
- Interface theatrics that make the long-form argument harder to read.

## Design Principles

1. Lead with the transition from fewer people to zero standing employees, then define the term immediately.
2. Preserve the user's causal argument and sequence: value creation, collapsing intention-to-output cost, applications, research, TAIC, founder judgment, valuable loops.
3. Make verification the visual and conceptual spine. Distinguish execution from validation and applications from research.
4. Keep the founder present. Execution may be delegated; purpose, boundaries, judgment, and accountability remain human.
5. Preserve the procedural WebGL field as a signature visual. Present it truthfully as a locally rendered atmosphere, never as model inference or evidence of value.
6. Keep the landing page concise. Supporting arguments, sources, and full prose belong in the whitepaper.
7. Keep the landing to four concise chapters: progression, value loop, two frontiers, and company path. Give the founder accountability boundary its own final frame inside the company chapter.
8. Use motion to explain the thesis. Reveals should show progression, loop closure, frontier separation, and the relay from company to lab.
9. Keep the company name in one horizontal header lockup at every supported viewport.

## Motion Language

The landing is one continuous proof engine, not a collection of effects. A single signal begins at the company mark, moves through intention and execution, crosses a visible verification gate, becomes value, separates into the applications and research frontiers, then scales from company to contract research organization to lab. Warm amber is reserved for founder judgement, boundaries, and accountability; it remains present while operational complexity moves into autonomous loops.

- Ultraviolet represents intention and unverified possibility.
- Cool white represents execution and measurement.
- Teal appears when output has crossed verification and become value.
- Blue represents the slower research-verification frontier.
- Amber represents the founder's irreversible accountability boundary.
- Scroll is native and reversible. The site must not hijack scrolling or require snap points.
- Silence is the default. Do not add autoplay audio or browser-generated effects.
- Reduced motion is a designed static composition, not hidden content with zero-duration transitions.

## Motion Architecture

GSAP ScrollTrigger is the sole narrative clock. It writes one normalized scene state consumed by both the DOM/SVG choreography and the custom renderer. WebGL2 is the preferred renderer, WebGL1 is the compatibility renderer, and the CSS composition is the failure-open fallback. Cross-document navigation stays native because View Transitions produced compositor corruption beside the sticky header and WebGL surface in tested browsers. Three.js, React Three Fiber, WebGPU, and browser inference are not runtime dependencies because this story does not require a 3D scene graph, compute simulation, or model execution.

Quality is adaptive and bounded by framebuffer pixels rather than device pixel ratio. Explicit low-power constraints set a persistent quality ceiling, and a failed promotion backs off before trying again. Continuous rendering stops when the page is hidden, changes live with the user's reduced-motion preference, and recovers explicitly after WebGL context restoration. A renderer failure must never hide or block the semantic thesis.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Use semantic landmarks and headings, visible keyboard focus, readable line lengths, sufficient contrast, reduced-motion behavior, and layouts that remain coherent from small mobile screens through large desktops.
