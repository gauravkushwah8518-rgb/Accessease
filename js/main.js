// Main JS for navbar scroll, mobile menu, and scroll animations
import { initAccessEasePanel } from './panel.js';
import { UI_CLASS } from './core.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize accessibility panel & widget on every page
  initAccessEasePanel();

  // Navbar scroll listener
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(() => {
          navbar.classList.toggle('scrolled', window.scrollY > 30);
          ticking = false;
        });
      },
      { passive: true }
    );
    navbar.classList.toggle('scrolled', window.scrollY > 30);
  }

  // Mobile Menu Handler
  const mobileBtn = document.querySelector('.mobile-menu-btn');
  const navContainer = document.querySelector('.nav-container');
  if (mobileBtn && navContainer) {
    let mobileMenu = document.querySelector('.mobile-dropdown-menu');
    if (!mobileMenu) {
      mobileMenu = document.createElement('div');
      mobileMenu.className = `mobile-dropdown-menu ${UI_CLASS}`;
      mobileMenu.id = 'mobile-dropdown-menu';
      mobileMenu.innerHTML = `
        <a href="index.html" class="mobile-nav-link">Home</a>
        <a href="demo.html" class="mobile-nav-link">Live Demo</a>
        <a href="docs.html" class="mobile-nav-link">Documentation</a>
        <a href="about.html" class="mobile-nav-link">About Mission</a>
      `;
      document.body.appendChild(mobileMenu);
    } else if (!mobileMenu.id) {
      mobileMenu.id = 'mobile-dropdown-menu';
    }

    mobileBtn.setAttribute('aria-controls', 'mobile-dropdown-menu');
    mobileBtn.setAttribute('aria-expanded', 'false');

    const setMenuOpen = (open) => {
      mobileMenu.classList.toggle('open', open);
      mobileBtn.textContent = open ? '\u2715' : '\u2630';
      mobileBtn.setAttribute('aria-expanded', String(open));
    };

    mobileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenuOpen(!mobileMenu.classList.contains('open'));
    });

    // Close on outside click and on Escape
    document.addEventListener('click', (e) => {
      if (!mobileMenu.contains(e.target) && !mobileBtn.contains(e.target)) {
        setMenuOpen(false);
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
        setMenuOpen(false);
        mobileBtn.focus();
      }
    });
  }

  // Ambient background: inject Sparrow-style color orbs + film grain into every page's
  // .bg-particles layer so the markup stays a single empty div.
  document.querySelectorAll('.bg-particles').forEach((layer) => {
    if (layer.querySelector('.orb')) return;
    ['a', 'b', 'c'].forEach((variant) => {
      const orb = document.createElement('div');
      orb.className = `orb ${variant}`;
      layer.appendChild(orb);
    });
    const grain = document.createElement('div');
    grain.className = 'orb-grain';
    layer.appendChild(grain);
  });

  // Staggered entrances: grid/section children reveal one after another.
  document
    .querySelectorAll('main [style*="grid-template-columns"], .footer-grid')
    .forEach((grid) => {
      if (grid.querySelector('.reveal')) grid.classList.add('stagger');
    });

  // Mouse spotlight on glass cards (Sparrow-style). CSS handles the visuals; JS only
  // feeds the cursor position as custom properties. Skipped for reduced motion.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.glass-card').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        card.style.setProperty('--my', `${event.clientY - rect.top}px`);
      });
    });
  }

  // Scroll Reveal Intersection Observer
  const revealTargets = document.querySelectorAll('.reveal');

  // Without IntersectionObserver the content must still become visible.
  if (!('IntersectionObserver' in window)) {
    revealTargets.forEach((el) => el.classList.add('in-view'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          obs.unobserve(entry.target);
        }
      });
    },
    { root: null, rootMargin: '0px', threshold: 0.15 }
  );

  revealTargets.forEach((el) => observer.observe(el));
});
