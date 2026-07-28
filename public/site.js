import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
gsap.config({ nullTargetWarn: false });

const root = document.documentElement;
const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const sceneElements = [...document.querySelectorAll('[data-field-state]')];
const sceneNames = ['hero', 'loop', 'frontiers', 'company'];
const sceneNameFromElement = (element) =>
  element?.dataset.fieldState === 'mechanism'
    ? 'loop'
    : element?.dataset.fieldState ?? 'hero';
const sectionLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
const motionGroups = [...document.querySelectorAll('.landing-page [data-motion-group]')];
const proofPath = document.querySelector('#value-proof-path');
const proofToken = document.querySelector('[data-loop-token]');
const frontierProofPath = document.querySelector('#frontier-proof-path');
const frontierProofToken = document.querySelector('[data-frontier-token]');
const companyPhases = [...document.querySelectorAll('[data-company-phase]')];
const scaleIndex = document.querySelector('[data-scale-index]');
const brand = document.querySelector('.brand');
const proofTriggers = [...document.querySelectorAll('.brand, .button')];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const progress = clamp((value - from) / Math.max(0.0001, to - from));
  return progress * progress * (3 - 2 * progress);
};

const motionState = {
  scene: 'hero',
  sceneIndex: 0,
  scenePosition: 0,
  sceneProgress: 0,
  documentProgress: 0,
  velocity: 0,
  intro: motionQuery?.matches ? 1 : 0,
  reduced: motionQuery?.matches ?? false,
  locals: Object.fromEntries(sceneNames.map((name) => [name, 0])),
};

window.__TAIC_MOTION__ = motionState;

let sceneLayout = [];
let proofPathLength = 0;
let frontierProofPathLength = 0;
let director;
let heroIntro;
let destroyed = false;
let previousScroll = window.scrollY;
let previousUpdateAt = performance.now();

const setRootNumber = (name, value) => {
  root.style.setProperty(name, Number.isFinite(value) ? value.toFixed(4) : '0');
};

const cacheLayout = () => {
  sceneLayout = sceneElements.map((element, index) => ({
    element,
    name: sceneNameFromElement(element),
    index,
    top: element.offsetTop,
    height: Math.max(1, element.offsetHeight),
    center: element.offsetTop + element.offsetHeight * 0.5,
  }));

  proofPathLength = proofPath?.getTotalLength?.() ?? 0;
  frontierProofPathLength = frontierProofPath?.getTotalLength?.() ?? 0;
};

const scenePositionAt = (viewportCenter) => {
  if (sceneLayout.length < 2 || viewportCenter <= sceneLayout[0].center) {
    return 0;
  }

  const finalScene = sceneLayout.at(-1);
  if (viewportCenter >= finalScene.center) {
    return finalScene.index;
  }

  for (let index = 0; index < sceneLayout.length - 1; index += 1) {
    const current = sceneLayout[index];
    const next = sceneLayout[index + 1];
    if (viewportCenter <= next.center) {
      return current.index + clamp(
        (viewportCenter - current.center) / Math.max(1, next.center - current.center),
      );
    }
  }

  return finalScene.index;
};

const updatePathToken = (path, token, pathLength, progress) => {
  if (!path || !token || pathLength <= 0) {
    return;
  }

  const point = path.getPointAtLength(pathLength * clamp(progress));
  gsap.set(token, { attr: { cx: point.x, cy: point.y } });
};

const setActiveNavigation = (activeScene) => {
  const activeId = activeScene?.element.id;
  sectionLinks.forEach((link) => {
    const isCurrent = link.getAttribute('href') === `#${activeId}`;
    if (isCurrent) {
      link.setAttribute('aria-current', 'true');
    } else {
      link.removeAttribute('aria-current');
    }
  });
};

const updateNarrative = (scrollPosition = window.scrollY, velocityHint) => {
  if (destroyed || sceneLayout.length === 0) {
    return;
  }

  const viewportHeight = Math.max(1, window.innerHeight);
  const viewportCenter = scrollPosition + viewportHeight * 0.5;
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - viewportHeight);
  const scenePosition = scenePositionAt(viewportCenter);
  const activeIndex = clamp(Math.round(scenePosition), 0, sceneLayout.length - 1);
  const activeScene = sceneLayout[activeIndex];
  const now = performance.now();
  const elapsed = Math.max(16, now - previousUpdateAt);
  const measuredVelocity = ((scrollPosition - previousScroll) / elapsed) * 1000;
  const velocity = Number.isFinite(velocityHint) ? velocityHint : measuredVelocity;

  previousScroll = scrollPosition;
  previousUpdateAt = now;

  motionState.scene = activeScene.name;
  motionState.sceneIndex = activeIndex;
  motionState.scenePosition = scenePosition;
  motionState.documentProgress = clamp(scrollPosition / maxScroll);
  motionState.velocity = clamp(velocity / 2400, -1, 1);

  root.dataset.scene = activeScene.name;
  root.dataset.scenePosition = scenePosition.toFixed(3);
  if (!motionState.reduced) {
    setRootNumber('--scene-position', scenePosition);
    setRootNumber('--document-progress', motionState.documentProgress);
    setRootNumber('--scroll-velocity', motionState.velocity);
    setRootNumber('--intro-progress', motionState.intro);
  }

  for (const item of sceneLayout) {
    const entry = item.top - viewportHeight;
    const exit = item.top + item.height;
    const localProgress = clamp((scrollPosition - entry) / Math.max(1, exit - entry));
    const presence = clamp(1 - Math.abs(scenePosition - item.index));
    motionState.locals[item.name] = localProgress;
    if (!motionState.reduced) {
      item.element.style.setProperty('--section-progress', localProgress.toFixed(4));
      item.element.style.setProperty('--section-presence', presence.toFixed(4));
      setRootNumber(`--${item.name}-progress`, localProgress);
      setRootNumber(`--${item.name}-presence`, presence);
    }

    if (presence > 0.04 || localProgress > 0.12) {
      item.element
        .querySelectorAll('[data-motion-group]')
        .forEach((group) => group.classList.add('is-visible'));
    }
  }

  motionState.sceneProgress = motionState.locals[activeScene.name];
  root.dataset.sceneProgress = motionState.sceneProgress.toFixed(3);
  if (!motionState.reduced) {
    const loopProofProgress = smoothstep(0.24, 0.8, motionState.locals.loop);
    const frontierProofProgress = smoothstep(0.2, 0.82, motionState.locals.frontiers);
    const companyJourney = smoothstep(0.34, 0.67, motionState.locals.company) * 2;

    setRootNumber('--loop-proof-progress', loopProofProgress);
    setRootNumber('--frontier-proof-progress', frontierProofProgress);
    setRootNumber('--company-journey', companyJourney);
    updatePathToken(proofPath, proofToken, proofPathLength, loopProofProgress);
    updatePathToken(
      frontierProofPath,
      frontierProofToken,
      frontierProofPathLength,
      frontierProofProgress,
    );

    companyPhases.forEach((item, index) => {
      const phaseOffset = index - companyJourney;
      const phasePresence = clamp(1 - Math.abs(phaseOffset) * 1.7);
      item.style.setProperty('--phase-presence', phasePresence.toFixed(4));
      item.style.setProperty('--phase-offset', phaseOffset.toFixed(4));
    });
    if (scaleIndex) {
      scaleIndex.textContent = String(Math.round(companyJourney) + 1).padStart(2, '0');
    }
  }
  setActiveNavigation(activeScene);

  window.dispatchEvent(new CustomEvent('taic:motion-state', { detail: motionState }));
};

const revealEverything = () => {
  motionGroups.forEach((group) => group.classList.add('is-visible'));
  gsap.set('[data-motion-item]', { clearProps: 'opacity,transform,clipPath,filter' });
};

const playHeroIntroduction = () => {
  if (motionState.reduced || !document.querySelector('[data-motion-group="hero"]')) {
    motionState.intro = 1;
    setRootNumber('--intro-progress', 1);
    return;
  }

  const heroGroup = document.querySelector('[data-motion-group="hero"]');
  const eyebrow = heroGroup.querySelector('.eyebrow');
  const stages = [...heroGroup.querySelectorAll('.hero-stage')];
  const statementChildren = [...heroGroup.querySelectorAll('.hero__statement > *')];

  heroGroup.classList.add('is-visible');
  heroIntro = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onUpdate: () => {
      setRootNumber('--intro-progress', motionState.intro);
    },
  });

  heroIntro
    .from(eyebrow, { autoAlpha: 0, x: -22, duration: 0.55 }, 0)
    .from(
      stages,
      {
        autoAlpha: 0,
        clipPath: 'inset(0 0 100% 0)',
        yPercent: 36,
        stagger: 0.12,
        duration: 0.84,
      },
      0.08,
    )
    .from(
      statementChildren,
      { autoAlpha: 0, y: 18, stagger: 0.08, duration: 0.58 },
      0.66,
    )
    .to(motionState, { intro: 1, duration: 1.55, ease: 'power2.out' }, 0);
};

const applyMotionPreference = (reduced) => {
  motionState.reduced = reduced;
  root.dataset.motion = reduced ? 'reduced' : 'full';

  if (reduced) {
    root.classList.remove('motion-enabled');
    heroIntro?.progress(1).pause();
    motionState.intro = 1;
    revealEverything();
    setRootNumber('--scene-position', 0);
    setRootNumber('--document-progress', 0);
    setRootNumber('--scroll-velocity', 0);
    setRootNumber('--hero-presence', 1);
    setRootNumber('--loop-presence', 0);
    setRootNumber('--frontiers-presence', 0);
    setRootNumber('--company-presence', 0);
    setRootNumber('--loop-proof-progress', 1);
    setRootNumber('--frontier-proof-progress', 1);
    setRootNumber('--company-journey', 2);
    updatePathToken(proofPath, proofToken, proofPathLength, 1);
    updatePathToken(frontierProofPath, frontierProofToken, frontierProofPathLength, 1);
    companyPhases.forEach((item, index) => {
      item.style.setProperty('--phase-presence', '1');
      item.style.setProperty('--phase-offset', String(index));
    });
    if (scaleIndex) {
      scaleIndex.textContent = '03';
    }
  } else {
    root.classList.add('motion-enabled');
    if (!heroIntro) {
      motionState.intro = 1;
    }
  }

  setRootNumber('--intro-progress', motionState.intro);
  updateNarrative(window.scrollY, 0);
};

const onMotionPreferenceChange = (event) => {
  applyMotionPreference(event.matches);
};

const onProofTrigger = (event) => {
  event.currentTarget.classList.add('is-proving');
  window.dispatchEvent(
    new CustomEvent('taic:proof-signal', {
      detail: { source: event.currentTarget === brand ? 'brand' : 'action' },
    }),
  );
};

const clearProofTrigger = (event) => {
  event.currentTarget.classList.remove('is-proving');
};

const destroy = () => {
  if (destroyed) {
    return;
  }

  destroyed = true;
  director?.kill();
  heroIntro?.kill();
  motionQuery?.removeEventListener?.('change', onMotionPreferenceChange);
  proofTriggers.forEach((element) => {
    element.removeEventListener('pointerenter', onProofTrigger);
    element.removeEventListener('pointerleave', clearProofTrigger);
  });
  ScrollTrigger.removeEventListener('refreshInit', cacheLayout);
  window.removeEventListener('pagehide', onPageHide);
};

const onPageHide = (event) => {
  if (!event.persisted) {
    destroy();
  }
};

cacheLayout();

director = ScrollTrigger.create({
  id: 'taic-proof-engine',
  start: 0,
  end: 'max',
  onUpdate: (self) => updateNarrative(self.scroll(), self.getVelocity()),
  onRefresh: () => updateNarrative(window.scrollY, 0),
});

ScrollTrigger.addEventListener('refreshInit', cacheLayout);
if (motionQuery?.addEventListener) {
  motionQuery.addEventListener('change', onMotionPreferenceChange);
}
proofTriggers.forEach((element) => {
  element.addEventListener('pointerenter', onProofTrigger, { passive: true });
  element.addEventListener('pointerleave', clearProofTrigger, { passive: true });
});
window.addEventListener('pagehide', onPageHide);

if (window.__taicMotionFallback) {
  window.clearTimeout(window.__taicMotionFallback);
  delete window.__taicMotionFallback;
}

root.dataset.motion = motionState.reduced ? 'reduced' : 'full';
updateNarrative(window.scrollY, 0);
playHeroIntroduction();
applyMotionPreference(motionState.reduced);

document.fonts?.ready
  ?.then(() => ScrollTrigger.refresh())
  .catch(() => updateNarrative(window.scrollY, 0));
