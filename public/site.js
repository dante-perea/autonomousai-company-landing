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
const loopPhases = [...document.querySelectorAll('[data-loop-phase]')];
const companyPhases = [...document.querySelectorAll('[data-company-phase]')];

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

const setJourneyPhases = (elements, journey, sharpness = 1.55) => {
  elements.forEach((element, index) => {
    const phaseOffset = index - journey;
    const phasePresence = clamp(1 - Math.abs(phaseOffset) * sharpness);
    element.style.setProperty('--phase-presence', phasePresence.toFixed(4));
    element.style.setProperty('--phase-offset', phaseOffset.toFixed(4));
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

  const loopJourney = smoothstep(0.18, 0.78, motionState.locals.loop) * 3;
  const frontierSplit = smoothstep(0.18, 0.72, motionState.locals.frontiers);
  const companyJourney = smoothstep(0.34, 0.48, motionState.locals.company) * 2;
  const boundaryProgress = smoothstep(0.5, 0.55, motionState.locals.company);
  const founderPresence = smoothstep(0.55, 0.61, motionState.locals.company);

  if (!motionState.reduced) {
    setRootNumber('--loop-proof-progress', loopJourney / 3);
    setRootNumber('--frontier-split', frontierSplit);
    setRootNumber('--company-journey', companyJourney);
    setRootNumber('--boundary-progress', boundaryProgress);
    setRootNumber('--founder-presence', founderPresence);
    setJourneyPhases(loopPhases, loopJourney);
    setJourneyPhases(companyPhases, companyJourney, 1);
  }

  setActiveNavigation(activeScene);
  window.dispatchEvent(new CustomEvent('taic:motion-state', { detail: motionState }));
};

const revealEverything = () => {
  motionGroups.forEach((group) => group.classList.add('is-visible'));
  gsap.set('[data-motion-item]', {
    clearProps: 'opacity,transform,clipPath,filter,fontVariationSettings',
  });
};

const playHeroIntroduction = () => {
  const heroGroup = document.querySelector('[data-motion-group="hero"]');
  if (motionState.reduced || !heroGroup) {
    motionState.intro = 1;
    setRootNumber('--intro-progress', 1);
    return;
  }

  const progression = [...heroGroup.querySelectorAll('[data-progress-step], .hero__arrow')];
  const titleLines = [...heroGroup.querySelectorAll('.hero-title__line')];
  const supporting = [
    heroGroup.querySelector('.hero__statement'),
    heroGroup.querySelector('.text-action'),
  ].filter(Boolean);

  heroGroup.classList.add('is-visible');
  heroIntro = gsap.timeline({
    defaults: { ease: 'power4.out' },
    onUpdate: () => setRootNumber('--intro-progress', motionState.intro),
  });

  heroIntro
    .fromTo(
      progression,
      {
        autoAlpha: 0,
        x: -12,
      },
      {
        autoAlpha: 1,
        x: 0,
        stagger: 0.095,
        duration: 0.62,
      },
      0.1,
    )
    .fromTo(
      titleLines,
      {
        autoAlpha: 0,
        yPercent: 28,
        clipPath: 'inset(0 0 100% 0)',
      },
      {
        autoAlpha: 1,
        yPercent: 0,
        clipPath: 'inset(0 0 0% 0)',
        stagger: 0.11,
        duration: 1.05,
      },
      0.42,
    )
    .fromTo(
      supporting,
      {
        autoAlpha: 0,
        y: 14,
      },
      {
        autoAlpha: 1,
        y: 0,
        stagger: 0.11,
        duration: 0.72,
      },
      1.02,
    )
    .to(motionState, { intro: 1, duration: 1.9, ease: 'power2.out' }, 0);
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
    setRootNumber('--frontier-split', 1);
    setRootNumber('--company-journey', 2);
    setRootNumber('--boundary-progress', 1);
    setRootNumber('--founder-presence', 1);
    setJourneyPhases(loopPhases, 3);
    companyPhases.forEach((element) => {
      element.style.setProperty('--phase-presence', '1');
      element.style.setProperty('--phase-offset', '0');
    });
  } else {
    root.classList.add('motion-enabled');
  }

  setRootNumber('--intro-progress', motionState.intro);
  updateNarrative(window.scrollY, 0);
};

const onMotionPreferenceChange = (event) => {
  applyMotionPreference(event.matches);
};

const destroy = () => {
  if (destroyed) {
    return;
  }

  destroyed = true;
  director?.kill();
  heroIntro?.kill();
  if (motionQuery?.removeEventListener) {
    motionQuery.removeEventListener('change', onMotionPreferenceChange);
  }
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
  id: 'taic-optical-bench',
  start: 0,
  end: 'max',
  onUpdate: (self) => updateNarrative(self.scroll(), self.getVelocity()),
  onRefresh: () => updateNarrative(window.scrollY, 0),
});

ScrollTrigger.addEventListener('refreshInit', cacheLayout);
if (motionQuery?.addEventListener) {
  motionQuery.addEventListener('change', onMotionPreferenceChange);
}
window.addEventListener('pagehide', onPageHide);

const clearMotionFallback = () => {
  if (window.__taicMotionFallback) {
    window.clearTimeout(window.__taicMotionFallback);
    delete window.__taicMotionFallback;
  }
};

root.dataset.motion = motionState.reduced ? 'reduced' : 'full';
updateNarrative(window.scrollY, 0);
applyMotionPreference(motionState.reduced);

if (motionState.reduced) {
  clearMotionFallback();
} else {
  const fontReady = document.fonts?.load?.('600 1rem "Mona Sans"', 'Zero standing')
    ?.then(() => 'ready') ?? Promise.resolve('ready');
  const fontDeadline = new Promise((resolve) =>
    window.setTimeout(() => resolve('fallback'), 900),
  );
  Promise.race([fontReady, fontDeadline])
    .then((fontState) => {
      if (!destroyed) {
        if (fontState === 'fallback') {
          root.classList.add('font-fallback');
          document
            .querySelectorAll('[data-taic-font-resource]')
            .forEach((element) => element.remove());
        }
        playHeroIntroduction();
        clearMotionFallback();
        ScrollTrigger.refresh();
      }
    })
    .catch(() => {
      playHeroIntroduction();
      clearMotionFallback();
      updateNarrative(window.scrollY, 0);
    });
}
