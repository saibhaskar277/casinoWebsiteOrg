/**
 * Casino panel hero — driven by assets/casino/hero.config.json
 * Spin wheel click → smooth slot-style reel spin.
 */
(function () {
  const FALLBACK = {
    stage: { aspectRatio: '16 / 9', borderRadiusPx: 16, margin: '4px 0 8px', background: '#0a1428' },
    assets: {
      bg: 'assets/casino/bg.png',
      reel: 'assets/casino/reel.png',
      wheel: 'assets/casino/wheel.png',
      character: 'assets/casino/character.png',
    },
    frameAspect: 1.667,
    reelMachine: { top: '21%', left: '30%', width: '51%', zIndex: 4 },
    wheel: { top: '44%', left: '74%', width: '25%', zIndex: 5 },
    character: { bottom: '8%', left: '5%', height: '70%', zIndex: 6 },
    gridBounds: { left: 0.1317, right: 0.861, top: 0.1931, bottom: 0.9014 },
    reelRows: 3,
    symbols: [
      'assets/casino/symbol-0.png',
      'assets/casino/symbol-1.png',
      'assets/casino/symbol-2.png',
      'assets/casino/symbol-3.png',
      'assets/casino/symbol-4.png',
      'assets/casino/symbol-5.png',
      'assets/casino/symbol-6.png',
      'assets/casino/symbol-7.png',
      'assets/casino/symbol-8.png',
    ],
    reelColumns: [
      [2, 1, 3],
      [8, 3, 3],
      [5, 7, 6],
      [3, 4, 8],
      [0, 0, 5],
    ],
    decor: [],
  };

  const SPIN = {
    /** Extra random symbols above the final window (per column base). */
    fillerCount: 40,
    baseDurationMs: 2800,
    staggerMs: 360,
    /** Fraction of the spin that stays near full speed before soft landing. */
    cruiseUntil: 0.7,
    /** How quickly displayed Y catches the ideal eased target (higher = snappier). */
    lerpPerFrame: 0.2,
  };

  const WHEEL = {
    /** deg / second */
    idleSpeed: 26,
    fastSpeed: 720,
    /** How quickly angular speed lerps toward target (per ~16.7ms frame). */
    speedLerp: 0.08,
  };

  let config = null;
  let spinning = false;

  function layoutRev() {
    const rawRev = document.querySelector('meta[name="site-rev"]')?.content || '';
    return rawRev.includes('DEPLOY_REV') ? String(Date.now()) : rawRev || String(Date.now());
  }

  function casinoHeroCssVars(cfg) {
    const g = cfg.gridBounds || FALLBACK.gridBounds;
    const rm = cfg.reelMachine || FALLBACK.reelMachine;
    const wh = cfg.wheel || FALLBACK.wheel;
    const ch = cfg.character || FALLBACK.character;
    return {
      '--hero-reel-top': rm.top,
      '--hero-reel-left': rm.left,
      '--hero-reel-width': rm.width,
      '--hero-frame-aspect': String(cfg.frameAspect ?? FALLBACK.frameAspect),
      '--hero-grid-left': `${g.left * 100}%`,
      '--hero-grid-right': `${(1 - g.right) * 100}%`,
      '--hero-grid-top': `${g.top * 100}%`,
      '--hero-grid-bottom': `${(1 - g.bottom) * 100}%`,
      '--hero-reel-rows': String(cfg.reelRows ?? FALLBACK.reelRows),
      '--hero-wheel-top': wh.top,
      '--hero-wheel-left': wh.left,
      '--hero-wheel-width': wh.width,
      '--hero-char-bottom': ch.bottom,
      '--hero-char-left': ch.left,
      '--hero-char-height': ch.height,
    };
  }

  function decorStyle(d) {
    const parts = [];
    if (d.left != null) parts.push(`left:${d.left}`);
    if (d.right != null) parts.push(`right:${d.right}`);
    if (d.top != null) parts.push(`top:${d.top}`);
    if (d.bottom != null) parts.push(`bottom:${d.bottom}`);
    if (d.width != null) parts.push(`width:${d.width}`);
    if (d.transform) parts.push(`transform:${d.transform}`);
    if (d.opacity != null) parts.push(`opacity:${d.opacity}`);
    if (d.zIndex != null) parts.push(`z-index:${d.zIndex}`);
    return parts.join(';');
  }

  function randInt(max) {
    return Math.floor(Math.random() * max);
  }

  /** Slot feel: near-constant cruise, then soft ease-out landing. */
  function reelEase(t) {
    const cruise = SPIN.cruiseUntil;
    if (t <= cruise) {
      // Mild ease-in so the strip doesn't jump to full speed
      const u = t / cruise;
      const easedIn = u * u * (3 - 2 * u); // smoothstep
      return easedIn * cruise;
    }
    const u = (t - cruise) / (1 - cruise);
    const land = 1 - Math.pow(1 - u, 4);
    return cruise + land * (1 - cruise);
  }

  function buildStripIndices(symbolsLen, rows, finalCol, fillerCount) {
    const strip = [];
    const filler = Math.max(rows, fillerCount | 0);
    for (let i = 0; i < filler; i++) strip.push(randInt(symbolsLen));
    for (let r = 0; r < rows; r++) strip.push(finalCol[r] % symbolsLen);
    return strip;
  }

  function symbolImgs(strip, symbols) {
    return strip
      .map(
        (sym) =>
          `<img class="casino-hero__reel-symbol" src="${symbols[sym]}" alt="" draggable="false" decoding="async">`
      )
      .join('');
  }

  function randomFinalColumns(symbolsLen, cols, rows) {
    const out = [];
    for (let c = 0; c < cols; c++) {
      const col = [];
      for (let r = 0; r < rows; r++) col.push(randInt(symbolsLen));
      out.push(col);
    }
    return out;
  }

  function buildCasinoHeroScene(cfgIn) {
    const cfg = cfgIn || config || FALLBACK;
    const assets = cfg.assets || FALLBACK.assets;
    const symbols = cfg.symbols || FALLBACK.symbols;
    const columns = cfg.reelColumns || FALLBACK.reelColumns;
    const stage = cfg.stage || FALLBACK.stage;
    const rm = cfg.reelMachine || FALLBACK.reelMachine;
    const wh = cfg.wheel || FALLBACK.wheel;
    const ch = cfg.character || FALLBACK.character;
    const rows = cfg.reelRows ?? FALLBACK.reelRows;

    const cssVars = casinoHeroCssVars(cfg);
    const heroStyle = [
      `aspect-ratio:${stage.aspectRatio || '16 / 9'}`,
      `border-radius:${stage.borderRadiusPx ?? 16}px`,
      `margin:${stage.margin || '4px 0 8px'}`,
      `background:${stage.background || '#0a1428'}`,
      ...Object.entries(cssVars).map(([k, v]) => `${k}:${v}`),
    ].join(';');

    const cols = columns
      .map((col, colIdx) => {
        const strip = buildStripIndices(symbols.length, rows, col, SPIN.fillerCount);
        return `<div class="casino-hero__reel-column" data-col="${colIdx}">
          <div class="casino-hero__reel-strip" data-strip="${colIdx}">${symbolImgs(strip, symbols)}</div>
        </div>`;
      })
      .join('');

    const decorHtml = (cfg.decor || [])
      .map(
        (d) =>
          `<img class="casino-hero__decor" src="${d.src}" alt="" style="${decorStyle(d)}" loading="lazy" decoding="async">`
      )
      .join('');

    return `
      <div class="casino-hero" style="${heroStyle}" data-casino-hero>
        <div class="casino-hero__stage">
          <img class="casino-hero__bg" src="${assets.bg}" alt="" loading="eager" decoding="async">
          ${decorHtml}
          <div class="casino-hero__reel-machine" style="z-index:${rm.zIndex ?? 4}">
            <img class="casino-hero__reel-frame" src="${assets.reel}" alt="" loading="eager" decoding="async">
            <div class="casino-hero__symbol-grid">${cols}</div>
          </div>
          <button type="button" class="casino-hero__wheel" style="z-index:${wh.zIndex ?? 5}" aria-label="Spin the reels" title="Spin">
            <img class="casino-hero__wheel-img" src="${assets.wheel}" alt="" draggable="false" loading="eager" decoding="async">
          </button>
          <div class="casino-hero__character" style="z-index:${ch.zIndex ?? 6}">
            <img class="casino-hero__character-img" src="${assets.character}" alt="" loading="eager" decoding="async">
          </div>
        </div>
      </div>`;
  }

  function animateStrip(strip, distancePx, durationMs, delayMs, onNearLand) {
    return new Promise((resolve) => {
      const endY = -distancePx;
      let startTime = null;
      let currentY = 0;
      let lastNow = null;
      let landedHint = false;

      const tick = (now) => {
        if (startTime == null) {
          startTime = now;
          lastNow = now;
        }
        const dt = Math.min(34, Math.max(0, now - lastNow));
        lastNow = now;

        const elapsed = now - startTime - delayMs;
        if (elapsed < 0) {
          requestAnimationFrame(tick);
          return;
        }

        const t = Math.min(1, elapsed / durationMs);
        if (!landedHint && t >= SPIN.cruiseUntil) {
          landedHint = true;
          if (typeof onNearLand === 'function') onNearLand();
        }

        const targetY = endY * reelEase(t);
        // Frame-rate independent exponential lerp toward the eased target
        const alpha = 1 - Math.pow(1 - SPIN.lerpPerFrame, dt / 16.67);
        currentY += (targetY - currentY) * alpha;

        if (t >= 1 && Math.abs(currentY - endY) < 0.35) {
          strip.style.transform = `translate3d(0, ${endY}px, 0)`;
          resolve();
          return;
        }

        if (t >= 1) {
          // Finish with a firm lerp snap so we don't hang on tiny remainders
          currentY += (endY - currentY) * Math.min(1, alpha * 2.5);
          strip.style.transform = `translate3d(0, ${currentY}px, 0)`;
          if (Math.abs(currentY - endY) < 0.35) {
            strip.style.transform = `translate3d(0, ${endY}px, 0)`;
            resolve();
            return;
          }
          requestAnimationFrame(tick);
          return;
        }

        strip.style.transform = `translate3d(0, ${currentY}px, 0)`;
        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  function cellHeightPx(columnEl, rows) {
    const h = columnEl.clientHeight / rows;
    // Integer cell height prevents sub-pixel seam jitter while scrolling
    return Math.max(1, Math.round(h));
  }

  function prepareStripForSpin(strip, symbols, rows, finalCol, colIndex) {
    const column = strip.parentElement;
    const cellH = cellHeightPx(column, rows);
    column.style.setProperty('--reel-cell-h', `${cellH}px`);

    const filler = SPIN.fillerCount + colIndex * 8;
    const stripIndices = buildStripIndices(symbols.length, rows, finalCol, filler);
    strip.innerHTML = symbolImgs(stripIndices, symbols);
    strip.style.transition = 'none';
    strip.style.transform = 'translate3d(0, 0, 0)';
    strip.style.willChange = 'transform';
    return { len: stripIndices.length, cellH };
  }

  function settleStrip(strip, symbols, rows, finalCol) {
    const column = strip.parentElement;
    const cellH = cellHeightPx(column, rows);
    column.style.setProperty('--reel-cell-h', `${cellH}px`);

    const pad = 3;
    const visible = [];
    for (let i = 0; i < pad; i++) visible.push(randInt(symbols.length));
    for (let r = 0; r < rows; r++) visible.push(finalCol[r] % symbols.length);
    strip.innerHTML = symbolImgs(visible, symbols);
    strip.style.transform = `translate3d(0, ${-pad * cellH}px, 0)`;
    strip.style.willChange = 'auto';
  }

  /** Continuous wheel rotation with lerped angular velocity (no CSS animation snaps). */
  function startWheelDriver(wheelBtn) {
    const img = wheelBtn.querySelector('.casino-hero__wheel-img');
    if (!img) return null;

    const state = {
      angle: 0,
      speed: WHEEL.idleSpeed,
      targetSpeed: WHEEL.idleSpeed,
      lastNow: null,
      raf: 0,
      alive: true,
    };

    const tick = (now) => {
      if (!state.alive) return;
      if (state.lastNow == null) state.lastNow = now;
      const dt = Math.min(0.05, Math.max(0, (now - state.lastNow) / 1000));
      state.lastNow = now;

      const alpha = 1 - Math.pow(1 - WHEEL.speedLerp, (dt * 1000) / 16.67);
      state.speed += (state.targetSpeed - state.speed) * alpha;
      state.angle = (state.angle + state.speed * dt) % 360;
      img.style.transform = `rotate(${state.angle}deg)`;

      state.raf = requestAnimationFrame(tick);
    };

    state.raf = requestAnimationFrame(tick);

    return {
      setTargetSpeed(speed) {
        state.targetSpeed = speed;
      },
      boost() {
        state.targetSpeed = WHEEL.fastSpeed;
      },
      calm() {
        state.targetSpeed = WHEEL.idleSpeed;
      },
      stop() {
        state.alive = false;
        cancelAnimationFrame(state.raf);
      },
    };
  }

  async function runSpin(hero) {
    if (spinning || !hero) return;
    const cfg = config || FALLBACK;
    const symbols = cfg.symbols || FALLBACK.symbols;
    const rows = cfg.reelRows ?? FALLBACK.reelRows;
    const strips = [...hero.querySelectorAll('.casino-hero__reel-strip')];
    const wheelBtn = hero.querySelector('.casino-hero__wheel');
    const wheelDriver = hero._wheelDriver;
    if (!strips.length) return;

    spinning = true;
    hero.classList.add('is-spinning');
    hero.classList.remove('is-landing');
    if (wheelBtn) {
      wheelBtn.disabled = true;
      wheelBtn.classList.add('is-spinning');
    }
    if (wheelDriver) wheelDriver.boost();

    const finals = randomFinalColumns(symbols.length, strips.length, rows);
    const distances = [];

    strips.forEach((strip, i) => {
      const { len, cellH } = prepareStripForSpin(strip, symbols, rows, finals[i], i);
      const stopIndex = len - rows;
      distances.push(stopIndex * cellH);
    });

    // Force layout before animating
    void hero.offsetHeight;

    let landingMarked = false;
    const markLanding = () => {
      if (landingMarked) return;
      landingMarked = true;
      hero.classList.add('is-landing');
      // Begin easing wheel speed back toward idle as reels land
      if (wheelDriver) wheelDriver.calm();
    };

    const anims = strips.map((strip, i) => {
      const duration = SPIN.baseDurationMs + i * SPIN.staggerMs;
      const delay = i * 90;
      const onNearLand = i === strips.length - 1 ? markLanding : undefined;
      return animateStrip(strip, distances[i], duration, delay, onNearLand);
    });

    await Promise.all(anims);

    strips.forEach((strip, i) => settleStrip(strip, symbols, rows, finals[i]));

    spinning = false;
    hero.classList.remove('is-spinning', 'is-landing');
    if (wheelDriver) wheelDriver.calm();
    if (wheelBtn) {
      wheelBtn.disabled = false;
      wheelBtn.classList.remove('is-spinning');
    }
  }

  function initCasinoHeroSpin(root) {
    const hero = (root || document).querySelector('[data-casino-hero]');
    if (!hero || hero.dataset.spinBound === '1') return;
    hero.dataset.spinBound = '1';

    const wheel = hero.querySelector('.casino-hero__wheel');
    if (!wheel) return;

    // Kill any CSS animation and drive rotation in JS with lerped speed
    const img = wheel.querySelector('.casino-hero__wheel-img');
    if (img) {
      img.style.animation = 'none';
      img.style.transform = 'rotate(0deg)';
    }
    if (hero._wheelDriver) hero._wheelDriver.stop();
    hero._wheelDriver = startWheelDriver(wheel);

    const cfg = config || FALLBACK;
    const rows = cfg.reelRows ?? FALLBACK.reelRows;

    const placeStrips = () => {
      hero.querySelectorAll('.casino-hero__reel-strip').forEach((strip) => {
        const column = strip.parentElement;
        const cellH = cellHeightPx(column, rows);
        column.style.setProperty('--reel-cell-h', `${cellH}px`);
        const count = strip.children.length;
        const stopIndex = Math.max(0, count - rows);
        strip.style.transform = `translate3d(0, ${-stopIndex * cellH}px, 0)`;
      });
    };

    placeStrips();
    requestAnimationFrame(placeStrips);

    wheel.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runSpin(hero);
    });
  }

  async function loadCasinoHeroConfig() {
    if (config) return config;
    try {
      const res = await fetch(`assets/casino/hero.config.json?v=${encodeURIComponent(layoutRev())}`, {
        cache: 'no-cache',
      });
      if (!res.ok) throw new Error(String(res.status));
      config = await res.json();
    } catch (err) {
      console.warn('[casino-hero] config load failed, using fallback', err);
      config = FALLBACK;
    }
    return config;
  }

  window.buildCasinoHeroScene = buildCasinoHeroScene;
  window.initCasinoHeroSpin = initCasinoHeroSpin;
  window.loadCasinoHeroConfig = loadCasinoHeroConfig;
  window.__casinoHeroFallback = FALLBACK;
  window.casinoHeroReady = loadCasinoHeroConfig();
})();
