const root = document.documentElement;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const motionGroups = [...document.querySelectorAll('.landing-page [data-motion-group]')];

root.dataset.motion = reducedMotion ? 'reduced' : 'full';

if (!reducedMotion && motionGroups.length > 0) {
  const reveal = (group) => {
    group.classList.add('is-visible');
  };

  if ('IntersectionObserver' in window) {
    const motionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          reveal(entry.target);
          motionObserver.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.18 },
    );

    motionGroups.forEach((group) => motionObserver.observe(group));
  } else {
    motionGroups.forEach(reveal);
  }
}

if (window.__taicMotionFallback) {
  window.clearTimeout(window.__taicMotionFallback);
  delete window.__taicMotionFallback;
}

const sectionLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
const trackedSections = sectionLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if ('IntersectionObserver' in window && trackedSections.length > 0) {
  const navigationObserver = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visibleEntry) {
        return;
      }

      sectionLinks.forEach((link) => {
        const isCurrent = link.getAttribute('href') === `#${visibleEntry.target.id}`;
        if (isCurrent) {
          link.setAttribute('aria-current', 'true');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    },
    { rootMargin: "-25% 0px -60% 0px", threshold: [0.05, 0.2, 0.5] },
  );

  trackedSections.forEach((section) => navigationObserver.observe(section));
}
