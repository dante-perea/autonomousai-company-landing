import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { createFoundryWorld } from './foundry-world.js';

gsap.registerPlugin(ScrollTrigger);
gsap.config({ nullTargetWarn: false });

const root = document.documentElement;
const track = document.querySelector('[data-foundry-track]');
const stage = document.querySelector('[data-foundry-stage]');
const canvas = document.querySelector('#foundry-canvas');
const header = document.querySelector('.foundry-header');
const beats = [...document.querySelectorAll('[data-beat]')];
const proofLine = document.querySelector('[data-proof-line]');
const progressReadout = document.querySelector('[data-progress-readout]');
const progressCurrent = document.querySelector('[data-progress-current]');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointerQuery = window.matchMedia('(pointer: fine)');

const BEAT_RANGES = [
  { id: 'intention', start: 0, end: 0.105 },
  { id: 'execution', start: 0.105, end: 0.275 },
  { id: 'verification', start: 0.275, end: 0.425 },
  { id: 'frontiers', start: 0.425, end: 0.625 },
  { id: 'scale', start: 0.625, end: 0.81 },
  { id: 'judgement', start: 0.81, end: 1 },
];

const state = {
  progress: 0,
  velocity: 0,
  activeBeat: 'intention',
  activeIndex: 0,
  reducedMotion: reducedMotionQuery.matches,
  ready: false,
  destroyed: false,
  renderer: 'loading',
  renderState: 'loading',
};

let world = null;
let masterTimeline = null;
let scrollTrigger = null;
let lenis = null;
let lenisTicker = null;
let openingTimeline = null;
let resizeFrame = 0;
let previousScroll = window.scrollY;
let previousUpdateAt = performance.now();

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (from, to, value) => {
  const progress = clamp((value - from) / Math.max(0.0001, to - from));
  return progress * progress * (3 - 2 * progress);
};

const setRootNumber = (name, value) => {
  root.style.setProperty(name, Number.isFinite(value) ? value.toFixed(5) : '0');
};

const removeExternalFontResources = () => {
  document
    .querySelectorAll('[data-taic-font-resource]')
    .forEach((resource) => resource.remove());
};

const settleDisplayFonts = async () => {
  if (!document.fonts?.load) {
    return;
  }

  let timer;
  const deadline = new Promise((resolve) => {
    timer = window.setTimeout(() => resolve('timeout'), 900);
  });

  try {
    const outcome = await Promise.race([
      Promise.all([
        document.fonts.load('600 1em "Mona Sans"'),
        document.fonts.load('500 1em "Martian Mono"'),
      ]).then(() => 'ready'),
      deadline,
    ]);

    if (outcome === 'timeout') {
      root.classList.add('font-fallback');
      removeExternalFontResources();
    } else {
      root.classList.add('font-ready');
    }
  } catch {
    root.classList.add('font-fallback');
    removeExternalFontResources();
  } finally {
    window.clearTimeout(timer);
  }
};

const beatIndexAt = (progress) => {
  let activeIndex = 0;
  for (let index = 1; index < BEAT_RANGES.length; index += 1) {
    if (progress >= BEAT_RANGES[index].start) {
      activeIndex = index;
    }
  }
  return activeIndex;
};

const updateSemanticState = (progress) => {
  const activeIndex = beatIndexAt(progress);
  const active = BEAT_RANGES[activeIndex];
  const activeChanged = activeIndex !== state.activeIndex;

  state.activeIndex = activeIndex;
  state.activeBeat = active.id;
  root.dataset.activeBeat = active.id;

  beats.forEach((beat, index) => {
    const range = BEAT_RANGES[index];
    const localProgress = clamp((progress - range.start) / Math.max(0.001, range.end - range.start));
    const enter = smoothstep(range.start, Math.min(range.end, range.start + 0.06), progress);
    const exit = index === beats.length - 1
      ? 1
      : 1 - smoothstep(Math.max(range.start, range.end - 0.055), range.end, progress);
    const presence = clamp(enter * exit);
    const isActive = index === activeIndex;

    beat.style.setProperty('--beat-progress', localProgress.toFixed(5));
    beat.style.setProperty('--beat-presence', presence.toFixed(5));
    if (isActive) {
      beat.dataset.active = 'true';
    } else {
      delete beat.dataset.active;
    }

    if (state.reducedMotion) {
      beat.removeAttribute('aria-hidden');
      beat.inert = false;
    } else {
      beat.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      beat.inert = !isActive;
    }
  });

  if (progressCurrent) {
    progressCurrent.textContent = String(activeIndex + 1).padStart(2, '0');
  } else if (progressReadout) {
    progressReadout.textContent = `${String(activeIndex + 1).padStart(2, '0')} / ${String(BEAT_RANGES.length).padStart(2, '0')}`;
  }

  if (activeChanged) {
    window.dispatchEvent(new CustomEvent('taic:beat-change', {
      detail: { id: active.id, index: activeIndex, progress },
    }));
  }
};

const createMasterTimeline = () => {
  masterTimeline?.kill();
  masterTimeline = gsap.timeline({ paused: true, defaults: { overwrite: 'auto' } });
  masterTimeline.to({}, { duration: 1 }, 0);

  if (state.reducedMotion) {
    gsap.set(beats, { clearProps: 'all' });
    if (proofLine) {
      gsap.set(proofLine, { clearProps: 'all' });
    }
    return;
  }

  gsap.set(beats, {
    autoAlpha: 0,
    xPercent: 0,
    yPercent: 0,
    clipPath: 'none',
  });

  BEAT_RANGES.forEach((range, index) => {
    const beat = beats[index];
    if (!beat) {
      return;
    }

    const headlineLines = [...beat.querySelectorAll('[data-mask-line]')];
    const supporting = [...beat.querySelectorAll(
      '.foundry-beat__index, .foundry-progression, .foundry-beat__lede, '
      + '.foundry-beat__note, .foundry-loop, .foundry-loop li, '
      + '.foundry-frontiers, .foundry-frontiers article, .foundry-scale, '
      + '.foundry-scale li, .foundry-thesis-link--final',
    )];

    if (index === 0) {
      masterTimeline.set(
        beat,
        {
          autoAlpha: 1,
          xPercent: 0,
          yPercent: 0,
          clipPath: 'none',
        },
        0,
      );
      masterTimeline.set(headlineLines, { yPercent: 0, autoAlpha: 1 }, 0);
      masterTimeline.set(supporting, { y: 0, autoAlpha: 1 }, 0);
    } else {
      masterTimeline.set(beat, { autoAlpha: 1 }, range.start);

      masterTimeline.fromTo(
        headlineLines,
        { yPercent: 112, autoAlpha: 1 },
        {
          yPercent: 0,
          autoAlpha: 1,
          duration: 0.032,
          stagger: 0.004,
          ease: 'expo.out',
          immediateRender: false,
        },
        range.start + 0.002,
      );

      masterTimeline.fromTo(
        supporting,
        { y: 24, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.028,
          stagger: 0.0025,
          ease: 'power3.out',
          immediateRender: false,
        },
        range.start + 0.009,
      );
    }

    if (index < BEAT_RANGES.length - 1) {
      masterTimeline.to(
        headlineLines,
        {
          yPercent: -112,
          duration: 0.018,
          stagger: 0.0015,
          ease: 'power3.inOut',
        },
        range.end - 0.024,
      );
      masterTimeline.to(
        supporting,
        {
          y: -18,
          autoAlpha: 0,
          duration: 0.016,
          stagger: 0.001,
          ease: 'power2.in',
        },
        range.end - 0.022,
      );
      masterTimeline.set(
        beat,
        { autoAlpha: 0 },
        range.end - 0.001,
      );
    }
  });

  if (proofLine) {
    masterTimeline.fromTo(
      proofLine,
      { scaleY: 0.04, transformOrigin: 'center top' },
      { scaleY: 1, duration: 0.84, ease: 'none' },
      0.025,
    );
    masterTimeline.to(
      proofLine,
      {
        backgroundColor: 'oklch(0.70 0.13 72)',
        boxShadow: '0 0 28px oklch(0.70 0.13 72 / 0.36)',
        duration: 0.08,
        ease: 'power2.out',
      },
      0.84,
    );
  }

  const openingBeat = beats[0];
  if (openingBeat) {
    gsap.set(openingBeat, {
      autoAlpha: 1,
      yPercent: 0,
      clipPath: 'inset(0 0 0% 0)',
    });
    gsap.set(openingBeat.querySelectorAll(
      '[data-mask-line], .foundry-beat__index, .foundry-progression, '
      + '.foundry-beat__lede, .foundry-beat__note, .foundry-thesis-link--final',
    ), {
      autoAlpha: 1,
      yPercent: 0,
      y: 0,
    });
  }
};

const playOpening = () => {
  if (state.reducedMotion || state.progress > 0.012 || !beats[0]) {
    return;
  }

  openingTimeline?.kill();
  const openingBeat = beats[0];
  const headlineLines = [...openingBeat.querySelectorAll('[data-mask-line]')];
  const supporting = [
    ...openingBeat.querySelectorAll(
      '.foundry-beat__index, .foundry-progression, .foundry-beat__lede, .foundry-beat__note',
    ),
  ];

  openingTimeline = gsap.timeline({ defaults: { overwrite: 'auto' } });
  if (header) {
    openingTimeline.fromTo(
      header.children,
      { y: -10, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        duration: 0.62,
        stagger: 0.08,
        ease: 'power3.out',
      },
      0,
    );
  }
  openingTimeline.fromTo(
    headlineLines,
    { yPercent: 112 },
    {
      yPercent: 0,
      duration: 0.92,
      stagger: 0.11,
      ease: 'expo.out',
    },
    0.14,
  );
  openingTimeline.fromTo(
    supporting,
    { y: 22, autoAlpha: 0 },
    {
      y: 0,
      autoAlpha: 1,
      duration: 0.68,
      stagger: 0.075,
      ease: 'power3.out',
    },
    0.24,
  );
};

const updateProgress = (progress, velocity = 0) => {
  if (state.destroyed) {
    return;
  }

  const nextProgress = clamp(progress);
  const normalizedVelocity = clamp(velocity / 2600, -1, 1);

  if (nextProgress > 0.018 && openingTimeline?.isActive()) {
    openingTimeline.kill();
    openingTimeline = null;
  }

  state.progress = nextProgress;
  state.velocity = normalizedVelocity;
  setRootNumber('--foundry-progress', nextProgress);
  setRootNumber('--foundry-velocity', normalizedVelocity);
  root.dataset.journeyProgress = nextProgress.toFixed(4);

  if (!state.reducedMotion) {
    masterTimeline?.progress(nextProgress, false);
    world?.setProgress(nextProgress, normalizedVelocity);
  }

  updateSemanticState(nextProgress);
};

const updateFromNativeScroll = () => {
  if (!track || state.destroyed) {
    return;
  }

  const start = track.offsetTop;
  const end = Math.max(start + 1, track.offsetTop + track.offsetHeight - window.innerHeight);
  const progress = clamp((window.scrollY - start) / Math.max(1, end - start));
  const now = performance.now();
  const elapsed = Math.max(16, now - previousUpdateAt);
  const velocity = ((window.scrollY - previousScroll) / elapsed) * 1000;

  previousScroll = window.scrollY;
  previousUpdateAt = now;
  updateProgress(progress, velocity);
};

const createScrollDirector = () => {
  scrollTrigger?.kill();
  scrollTrigger = ScrollTrigger.create({
    trigger: track,
    start: 'top top',
    end: 'bottom bottom',
    invalidateOnRefresh: true,
    onUpdate: (self) => updateProgress(self.progress, self.getVelocity()),
  });
};

const destroyLenis = () => {
  if (lenisTicker) {
    gsap.ticker.remove(lenisTicker);
    lenisTicker = null;
  }
  lenis?.destroy();
  lenis = null;
};

const createLenis = () => {
  destroyLenis();
  if (state.reducedMotion || !finePointerQuery.matches || window.innerWidth < 900) {
    return;
  }

  lenis = new Lenis({
    autoRaf: false,
    duration: 1.05,
    smoothWheel: true,
    syncTouch: false,
    wheelMultiplier: 0.88,
  });
  lenis.on('scroll', ScrollTrigger.update);
  lenisTicker = (time) => lenis?.raf(time * 1000);
  gsap.ticker.add(lenisTicker);
  gsap.ticker.lagSmoothing(0);
};

const setRenderStatus = (status = {}) => {
  if (status.renderer) {
    state.renderer = status.renderer;
    root.dataset.renderer = status.renderer;
  }
  if (status.renderState) {
    state.renderState = status.renderState;
    root.dataset.renderState = status.renderState;
  }
  if (status.quality) {
    root.dataset.quality = status.quality;
  }
  if (status.gpu) {
    root.dataset.gpu = status.gpu;
  }
};

const createWorld = () => {
  world?.dispose();
  world = null;

  if (!canvas) {
    setRenderStatus({
      renderer: 'fallback',
      renderState: 'fallback',
      gpu: 'fallback',
      quality: 'fallback',
    });
    return;
  }

  try {
    world = createFoundryWorld({
      canvas,
      reducedMotion: state.reducedMotion,
      onStatus: setRenderStatus,
    });
    world.setProgress(state.reducedMotion ? 0.9 : state.progress, 0);
    if (state.reducedMotion) {
      world.pause();
    }
  } catch (error) {
    console.warn('Foundry renderer unavailable; semantic fallback remains active.', error);
    root.classList.add('foundry-fallback');
    setRenderStatus({
      renderer: 'fallback',
      renderState: 'fallback',
      gpu: 'fallback',
      quality: 'fallback',
    });
  }
};

const revealSemanticFallback = () => {
  root.classList.remove('motion-enabled');
  root.classList.add('foundry-fallback');
  root.dataset.foundryReady = 'false';
  gsap.set(beats, {
    clearProps: 'opacity,visibility,transform,clipPath',
  });
  beats.forEach((beat) => {
    beat.removeAttribute('aria-hidden');
    beat.inert = false;
  });
};

const applyMotionPreference = (reduced) => {
  state.reducedMotion = reduced;
  root.dataset.motion = reduced ? 'reduced' : 'full';
  createMasterTimeline();
  createLenis();
  createWorld();

  if (state.renderer === 'fallback') {
    revealSemanticFallback();
  } else if (reduced) {
    beats.forEach((beat) => {
      beat.removeAttribute('aria-hidden');
      beat.inert = false;
    });
  } else {
    updateFromNativeScroll();
  }

  ScrollTrigger.refresh();
};

const seek = (progress, immediate = false) => {
  if (!track) {
    return;
  }

  const nextProgress = clamp(progress);
  const start = track.offsetTop;
  const end = Math.max(start, track.offsetTop + track.offsetHeight - window.innerHeight);
  const destination = start + (end - start) * nextProgress;

  if (lenis) {
    lenis.scrollTo(destination, {
      immediate,
      duration: immediate ? 0 : 0.9,
      force: true,
    });
  } else if (immediate) {
    const previousScrollBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, destination);
    root.style.scrollBehavior = previousScrollBehavior;
  } else {
    window.scrollTo({ top: destination, behavior: 'smooth' });
  }
  updateProgress(nextProgress, 0);
};

const snapshot = () => ({
  progress: state.progress,
  velocity: state.velocity,
  beat: state.activeBeat,
  beatIndex: state.activeIndex,
  reducedMotion: state.reducedMotion,
  ready: state.ready,
  renderer: state.renderer,
  renderState: state.renderState,
  ...(world?.snapshot?.() ?? {}),
});

const resize = () => {
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => {
    world?.resize();
    createLenis();
    ScrollTrigger.refresh();
    updateFromNativeScroll();
  });
};

const pause = () => {
  world?.pause();
  lenis?.stop();
};

const resume = () => {
  if (!state.reducedMotion) {
    world?.resume();
    lenis?.start();
  }
  updateFromNativeScroll();
};

const destroy = () => {
  if (state.destroyed) {
    return;
  }
  state.destroyed = true;
  openingTimeline?.kill();
  openingTimeline = null;
  scrollTrigger?.kill();
  masterTimeline?.kill();
  destroyLenis();
  world?.dispose();
  window.cancelAnimationFrame(resizeFrame);
  window.removeEventListener('resize', resize);
  window.removeEventListener('scroll', updateFromNativeScroll);
};

const bindAnchors = () => {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const selector = link.getAttribute('href');
      if (!selector || selector === '#') {
        return;
      }
      const target = document.querySelector(selector);
      if (!target) {
        return;
      }
      const beatIndex = beats.indexOf(target);
      if (beatIndex >= 0) {
        event.preventDefault();
        seek(BEAT_RANGES[beatIndex].start + (beatIndex === 0 ? 0 : 0.012));
      } else if (lenis) {
        event.preventDefault();
        lenis.scrollTo(target, { offset: -72, duration: 0.95 });
      }
      window.history.replaceState(null, '', selector);
    });
  });
};

const initialize = async () => {
  root.dataset.motion = state.reducedMotion ? 'reduced' : 'full';

  if (!track || !stage || beats.length !== BEAT_RANGES.length) {
    root.classList.add('foundry-fallback');
    root.dataset.foundryReady = 'false';
    return;
  }

  window.__TAIC_FOUNDRY__ = {
    snapshot,
    getSnapshot: snapshot,
    seek,
    pause,
    resume,
    resize,
    destroy,
  };

  const fontsSettled = settleDisplayFonts();
  window.clearTimeout(window.__taicMotionFallback);
  createMasterTimeline();
  createWorld();

  if (state.renderer === 'fallback') {
    state.ready = true;
    revealSemanticFallback();
    await fontsSettled;
    return;
  }

  createLenis();
  createScrollDirector();
  bindAnchors();
  await fontsSettled;

  state.ready = true;
  root.dataset.foundryReady = 'true';
  root.classList.add('motion-enabled');
  updateFromNativeScroll();
  ScrollTrigger.refresh();
  playOpening();

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', updateFromNativeScroll, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause();
    } else {
      resume();
    }
  });
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', resume);
  reducedMotionQuery.addEventListener?.('change', (event) => applyMotionPreference(event.matches));
};

initialize().catch((error) => {
  console.error('The cinematic director failed to initialize.', error);
  root.classList.remove('motion-enabled');
  root.classList.add('foundry-fallback');
  root.dataset.foundryReady = 'false';
  root.dataset.renderer = 'fallback';
  root.dataset.renderState = 'fallback';
  beats.forEach((beat) => {
    beat.removeAttribute('aria-hidden');
    beat.inert = false;
  });
});
