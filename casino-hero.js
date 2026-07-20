/**
 * Casino panel hero — driven by assets/casino/hero.config.json
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

  let config = null;

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

  function buildCasinoHeroScene(cfgIn) {
    const cfg = cfgIn || config || FALLBACK;
    const assets = cfg.assets || FALLBACK.assets;
    const symbols = cfg.symbols || FALLBACK.symbols;
    const columns = cfg.reelColumns || FALLBACK.reelColumns;
    const stage = cfg.stage || FALLBACK.stage;
    const rm = cfg.reelMachine || FALLBACK.reelMachine;
    const wh = cfg.wheel || FALLBACK.wheel;
    const ch = cfg.character || FALLBACK.character;

    const cssVars = casinoHeroCssVars(cfg);
    const heroStyle = [
      `aspect-ratio:${stage.aspectRatio || '16 / 9'}`,
      `border-radius:${stage.borderRadiusPx ?? 16}px`,
      `margin:${stage.margin || '4px 0 8px'}`,
      `background:${stage.background || '#0a1428'}`,
      ...Object.entries(cssVars).map(([k, v]) => `${k}:${v}`),
    ].join(';');

    const cols = columns
      .map(
        (col) =>
          `<div class="casino-hero__reel-column">${col
            .map(
              (sym) =>
                `<img class="casino-hero__reel-symbol" src="${symbols[sym]}" alt="" loading="eager" decoding="async">`
            )
            .join('')}</div>`
      )
      .join('');

    const decorHtml = (cfg.decor || [])
      .map(
        (d) =>
          `<img class="casino-hero__decor" src="${d.src}" alt="" style="${decorStyle(d)}" loading="lazy" decoding="async">`
      )
      .join('');

    return `
      <div class="casino-hero" style="${heroStyle}" aria-hidden="true">
        <div class="casino-hero__stage">
          <img class="casino-hero__bg" src="${assets.bg}" alt="" loading="eager" decoding="async">
          ${decorHtml}
          <div class="casino-hero__reel-machine" style="z-index:${rm.zIndex ?? 4}">
            <img class="casino-hero__reel-frame" src="${assets.reel}" alt="" loading="eager" decoding="async">
            <div class="casino-hero__symbol-grid">${cols}</div>
          </div>
          <div class="casino-hero__wheel" style="z-index:${wh.zIndex ?? 5}">
            <img class="casino-hero__wheel-img" src="${assets.wheel}" alt="" loading="eager" decoding="async">
          </div>
          <div class="casino-hero__character" style="z-index:${ch.zIndex ?? 6}">
            <img class="casino-hero__character-img" src="${assets.character}" alt="" loading="eager" decoding="async">
          </div>
        </div>
      </div>`;
  }

  function loadCasinoHeroConfig() {
    const rev = layoutRev();
    return fetch(`assets/casino/hero.config.json?v=${rev}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`hero.config.json ${res.status}`);
        return res.json();
      })
      .then((json) => {
        config = json;
        return json;
      })
      .catch((err) => {
        console.warn('casino hero config failed, using fallback', err);
        config = FALLBACK;
        return FALLBACK;
      });
  }

  window.casinoHeroReady = loadCasinoHeroConfig();
  window.buildCasinoHeroScene = buildCasinoHeroScene;
  window.getCasinoHeroConfig = () => config || FALLBACK;
})();
