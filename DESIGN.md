# Design System

## Direction

The landing page is an interferometric darkroom: a silent optical instrument turning intention into a measured signal. It must feel severe, physical and precise, never like a neon AI dashboard.

## Governing rule

At every scroll position there is one phrase, one material event and one light source.

## Palette

- Vacuum: `oklch(0.075 0.010 270)`
- Graphite: `oklch(0.15 0.014 270)`
- Sensor white: `oklch(0.92 0.012 255)`
- Nickel: `oklch(0.64 0.016 255)`
- Coherence violet: `oklch(0.61 0.105 300)`
- Verified blue: `oklch(0.72 0.075 215)`
- Accountability amber: `oklch(0.74 0.105 72)`

Color belongs to physical events. Violet is unresolved signal, cool white is measurement, blue is verified output, and amber is reserved for founder judgement and irreversible accountability.

## Typography

Mona Sans Variable is the primary family. The intro waits for the family with a bounded deadline so the display face normally settles before motion starts. Width establishes hierarchy but does not distort during motion; display text is revealed through exposure and clipping. Martian Mono is reserved for sparse measurement coordinates. Headings remain solid sensor white; gradient text is prohibited.

## Composition

- Four chapters: progression, verification, frontiers and scale.
- One dominant statement per viewport.
- Text stays semantic DOM content at native resolution.
- The GPU canvas carries all optical geometry.
- No cards, HUD rings, orbit diagrams, particle fields, shockwaves or filled CTA rectangles.

## Motion

GSAP ScrollTrigger is the sole narrative clock. Motion is native-scroll, reversible and paced with long holds. The signature event is a coherent beam becoming measurable at verification. Reduced motion uses deliberate still compositions.

## Rendering

WebGL2 is preferred, WebGL1 is the compatibility renderer and CSS is the failure-open fallback. Rendering pauses when hidden, recovers after context restoration and adapts framebuffer work to measured performance. Capable devices can promote toward a 4.8-megapixel surface; consistently slow low-power renderers freeze temporal motion but still redraw on scroll.

## Accountability

Amber appears only at the final founder boundary. Autonomous operational complexity may recede, but the accountability plane remains fixed.
