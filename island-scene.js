/**
 * Quills Studios — Treasure Island scene
 * Composites assets/scene layers using layout.json.
 */
(function () {
  'use strict';

  let ART_W = 1920;
  let ART_H = 960;
  /** Exact cover prevents resolution-dependent gaps around the illustration. */
  let VIEW_ZOOM = 1;
  let LANDMARK_GROW = 1.2;
  const SCENE_BASE = 'assets/scene/';
  const MAX_RIPPLES = 8;
  /** Visible water band (art pixels). Overridden from layout.layers.water when present. */
  let WATER_HIT = { y: 380, h: 530 };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Filled from assets/scene/layout.json + assets/ui/layout.json */
  let LAYOUT = null;
  let HOTSPOTS = {
    1: { x: 355, y: 425, anchorY: 0.42 },
    2: { x: 1530, y: 340, anchorY: 0.42 },
    3: { x: 835, y: 520, anchorY: 0.42 },
    4: { x: 300, y: 720, anchorY: 0.42 },
    5: { x: 1470, y: 620, anchorY: 0.42 },
  };

  /** Replaced with git short SHA on GitHub Pages deploy; local dev falls back to live reload. */
  const DEPLOY_REV = '__DEPLOY_REV__';
  const isLocalHost =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname === '[::1]';
  // Local: always unique so layout/art edits are never served from cache.
  const layoutRev =
    isLocalHost || DEPLOY_REV.includes('DEPLOY_REV')
      ? String(Date.now())
      : DEPLOY_REV;
  const layoutFetch = (path) =>
    fetch(`${path}?v=${layoutRev}&r=${Math.random().toString(36).slice(2)}`, {
      cache: 'no-store',
    });

  /** Portrait phones get the dedicated 1080x1920 scene. */
  const MOBILE_MEDIA = '(max-width: 760px)';
  function isMobileViewport() {
    return (
      window.matchMedia(MOBILE_MEDIA).matches ||
      window.innerHeight > window.innerWidth
    );
  }
  let usingMobileScene = false;

  async function loadConfigs() {
    usingMobileScene = isMobileViewport();
    // Mobile: try the portrait layout, fall back to the desktop scene if missing.
    let sceneRes = null;
    if (usingMobileScene) {
      try {
        const mobRes = await layoutFetch('assets/scene/layout.mobile.json');
        if (mobRes.ok) sceneRes = mobRes;
        else usingMobileScene = false;
      } catch (_) {
        usingMobileScene = false;
      }
    }
    const uiRes = await layoutFetch('assets/ui/layout.json');
    if (!sceneRes) {
      sceneRes = await layoutFetch('assets/scene/layout.json');
    }
    if (!sceneRes.ok) throw new Error('Failed to load scene layout.json');
    const scene = await sceneRes.json();
    ART_W = scene.artWidth || 1920;
    ART_H = scene.artHeight || 960;
    VIEW_ZOOM = scene.viewZoom == null ? 1 : Number(scene.viewZoom);
    LANDMARK_GROW = scene.landmarkGrow == null ? 1.2 : Number(scene.landmarkGrow);

    const layers = scene.layers || {};
    const propsObj = scene.props || {};
    const overlaysObj = scene.overlays || {};
    if (layers.water) {
      WATER_HIT = {
        y: layers.water.y == null ? WATER_HIT.y : Number(layers.water.y),
        h: layers.water.h == null ? WATER_HIT.h : Number(layers.water.h),
      };
    }
    // Draw order for props (back → front). Treasure renders after overlays — see foregroundPropOrder.
    // cloudFront sits above the mountain/falls in the source art stack.
    const propOrder = [
      'shipFar', 'mountain', 'waterfall', 'waterfallSpray', 'cloudFront',
      'wake', 'village', 'flagVillage', 'ship', 'flagShip', 'fort', 'flagFort',
      'palmL', 'palmR2', 'palmR1',
    ];
    const foregroundPropOrder = ['treasure'];
    LAYOUT = {
      bg: Object.assign({ w: ART_W, h: ART_H, scale: 1 }, layers.bg),
      backClouds: Array.isArray(layers.backClouds) ? layers.backClouds.map((c) => Object.assign({ scale: 1 }, c)) : [],
      water: Object.assign({ w: ART_W, h: ART_H, scale: 1 }, layers.water),
      shadow: Object.assign({ w: ART_W, h: ART_H, scale: 1 }, layers.shadow),
      props: propOrder
        .filter((id) => propsObj[id])
        .map((id) => Object.assign({ id, scale: 1 }, propsObj[id], { id })),
      foregroundProps: foregroundPropOrder
        .filter((id) => propsObj[id])
        .map((id) => Object.assign({ id, scale: 1 }, propsObj[id], { id })),
      overlays: ['overlayL', 'overlayR']
        .filter((id) => overlaysObj[id])
        .map((id) => Object.assign({ id, scale: 1 }, overlaysObj[id], { id })),
    };

    if (uiRes.ok) {
      const ui = await uiRes.json();
      const hotspots =
        usingMobileScene && ui.mobileHotspots ? ui.mobileHotspots : ui.hotspots;
      if (hotspots) {
        Object.keys(hotspots).forEach((id) => {
          const h = hotspots[id];
          HOTSPOTS[id] = {
            x: Number(h.x),
            y: Number(h.y),
            anchorY: h.anchorY == null ? 0.42 : Number(h.anchorY),
            numberScale: h.numberScale == null ? 1 : Number(h.numberScale),
            textScale: h.textScale == null ? 1 : Number(h.textScale),
          };
        });
      }
    }
  }

  let renderer, scene, camera, clock;
  let artRoot, view = { scaleX: 1, scaleY: 1, ox: 0, oy: 0 };
  let waterMat, wakeMat, shipMesh, shipShadow, mountainMesh;
  let cloudMeshes = [];
  let waveMats = [];
  let waterfallMats = [];
  let flagMats = [];
  let palmMeshes = [];
  let mistPoints, dropletPoints, splashPoints, seagulls = [];
  let landmarkMeshes = [];
  let ripples = [];
  let animId = 0;
  let running = true;
  const propMeshes = {};

  /** Section landmarks that must keep native PNG proportions under stretch-to-fill. */
  const LANDMARK_IDS = new Set([
    'ship',
    'shipFar',
    'mountain',
    'waterfall',
    'waterfallSpray',
    'village',
    'treasure',
    'fort',
    'fortWaves',
    'wake',
    'flagShip',
    'flagFort',
    'flagVillage',
  ]);

  function syncLandmarkAspect() {
    const stage = document.getElementById('stage');
    if (!stage) return;
    const vw = Math.max(1, stage.clientWidth);
    const vh = Math.max(1, stage.clientHeight);
    // Undo non-uniform stretch for these props only: keep sprite pixel aspect = PNG aspect.
    const sx = (ART_W / ART_H) * (vh / vw);
    for (let i = 0; i < landmarkMeshes.length; i++) {
      const mesh = landmarkMeshes[i];
      const grow = mesh.userData.landmarkGrow || 1;
      mesh.scale.set(sx * grow, grow, 1);
    }
    if (shipShadow) {
      const grow = shipShadow.userData.landmarkGrow || 1;
      shipShadow.scale.set(sx * grow, grow, 1);
      shipShadow.userData.baseScaleX = sx * grow;
    }
  }

  function setBootProgress(pct, status) {
    const fill = document.getElementById('boot-bar-fill');
    const label = document.getElementById('boot-pct');
    const statusEl = document.getElementById('boot-status');
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    if (fill) fill.style.width = `${clamped}%`;
    if (label) label.textContent = `${clamped}%`;
    if (status && statusEl) statusEl.textContent = status;
  }

  function revealSite() {
    const loader = document.getElementById('boot-loader');
    document.body.classList.remove('is-loading');
    document.body.classList.add('is-ready');
    if (loader) loader.setAttribute('aria-busy', 'false');
  }

  function texUrl(file) {
    if (!file) return file;
    let url = file;
    if (/^(https?:|data:|blob:)/i.test(file) || file.startsWith('/') || file.startsWith('assets/')) {
      url = file;
    } else {
      url = SCENE_BASE + file;
    }
    url = url.split('/').map((seg) => encodeURIComponent(decodeURIComponent(seg))).join('/');
    // Bust stale image caches — art files change without renaming.
    return `${url}?v=${layoutRev}`;
  }

  function loadTex(file) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        texUrl(file),
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.premultiplyAlpha = false;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }

  function pxToLocal(x, y, w, h) {
    // Art space: (0,0) top-left → Three local with origin center, Y up
    const cx = x + w / 2;
    const cy = y + h / 2;
    return {
      x: (cx / ART_W) * 2 - 1,
      y: -((cy / ART_H) * 2 - 1),
      w: (w / ART_W) * 2,
      h: (h / ART_H) * 2,
    };
  }

  function makePlane(tex, layer, z, material) {
    const s = layer.scale == null ? 1 : Number(layer.scale);
    const loc = pxToLocal(layer.x, layer.y, layer.w, layer.h);
    const mat =
      material ||
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(loc.w * s, loc.h * s), mat);
    mesh.position.set(loc.x, loc.y, z);
    mesh.userData.propScale = s;
    return mesh;
  }

  // UV-warp only — MeshBasicMaterial keeps the PNG colors (no tint / no custom color math).
  function makeWaterMaterial(tex) {
    const rippleUniforms = [];
    for (let i = 0; i < MAX_RIPPLES; i++) rippleUniforms.push(new THREE.Vector4(0, 0, -10, 0));

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    mat.userData.uTime = { value: 0 };
    mat.userData.uReduced = { value: reducedMotion ? 1 : 0 };
    mat.userData.uMouse = { value: new THREE.Vector2(0.5, 0.5) };
    mat.userData.uRipples = { value: rippleUniforms };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = mat.userData.uTime;
      shader.uniforms.uReduced = mat.userData.uReduced;
      shader.uniforms.uMouse = mat.userData.uMouse;
      shader.uniforms.uRipples = mat.userData.uRipples;
      mat.userData.shader = shader;

      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uReduced;
        uniform vec2 uMouse;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash(i), b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec2 uv = vMapUv;
          float t = uTime * (1.0 - uReduced);
          float shore = 1.0 - smoothstep(0.0, 0.42, uv.y);
          float midShore = smoothstep(0.0, 0.18, uv.y) * (1.0 - smoothstep(0.18, 0.48, uv.y));
          float ocean = smoothstep(0.28, 0.72, uv.y);
          float w1 = noise(uv * 4.0 + vec2(t * 0.025, t * 0.012));
          float w2 = noise(uv * 9.0 - vec2(t * 0.035, -t * 0.018));
          float depthMotion = mix(0.45, 1.0, smoothstep(0.0, 0.8, uv.y));
          vec2 distort = vec2(
            ((w1 - 0.5) * 0.0022 + sin(uv.y * 20.0 + t * 0.32) * 0.0012) * depthMotion,
            ((w2 - 0.5) * 0.0017 + sin(uv.x * 34.0 - t * 0.26) * 0.0007) * depthMotion
          );
          float wash = sin(uv.x * 2.4 + t * 0.55) * 0.5 + 0.5;
          float wash2 = sin(uv.x * 5.1 - t * 0.38 + w1 * 2.0) * 0.5 + 0.5;
          float lap = mix(wash, wash2, 0.45);
          float beachNoise = noise(uv * vec2(28.0, 14.0) + vec2(t * 0.18, -t * 0.09));
          float beachNoise2 = noise(uv * vec2(52.0, 22.0) - vec2(t * 0.12, t * 0.21));
          float grain = (beachNoise - 0.5) * 0.0045 + (beachNoise2 - 0.5) * 0.0022;
          distort += vec2(
            sin(uv.y * 40.0 + t * 0.7 + beachNoise * 4.0) * shore * 0.0035 + grain * shore * 1.4,
            (lap - 0.5) * shore * 0.018 + grain * 0.6
          );
          distort.x += (beachNoise - 0.5) * midShore * 0.005;
          distort.y += sin(t * 0.85 + uv.x * 6.0) * midShore * 0.006;
          float swellA = sin(uv.x * 6.5 + uv.y * 3.2 - t * 0.42);
          float swellB = sin(uv.x * 3.1 - uv.y * 5.8 + t * 0.28 + w2 * 3.0);
          float oceanNoise = noise(uv * vec2(3.2, 2.4) + vec2(t * 0.04, t * 0.02));
          float oceanRipple = noise(uv * vec2(18.0, 10.0) + vec2(-t * 0.08, t * 0.05));
          distort += vec2(
            swellA * 0.0025 + swellB * 0.0013 + (oceanNoise - 0.5) * 0.0024,
            swellB * 0.0022 + (oceanRipple - 0.5) * 0.0014
          ) * ocean * 0.3;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = uRipples[i];
            if (r.w > 0.001) {
              float age = t - r.z;
              if (age >= 0.0 && age <= 2.2) {
                float dist = distance(uv, r.xy);
                float radius = age * 0.14;
                float ring = exp(-pow((dist - radius) * 38.0, 2.0));
                float fade = (1.0 - age / 2.2) * r.w;
                distort += normalize(uv - r.xy + 1e-4) * ring * fade * 0.006;
              }
            }
          }
          vec4 sampledDiffuseColor = texture2D(map, clamp(uv + distort, 0.0, 1.0));
          diffuseColor *= sampledDiffuseColor;
        #endif
        `
      );
    };
    mat.customProgramCacheKey = () => 'island-water-uv-only-v1';
    return mat;
  }

  function makeWakeMaterial(tex) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    mat.userData.uTime = { value: 0 };
    mat.userData.uReduced = { value: reducedMotion ? 1 : 0 };
    mat.userData.uSwell = { value: 0 };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = mat.userData.uTime;
      shader.uniforms.uReduced = mat.userData.uReduced;
      shader.uniforms.uSwell = mat.userData.uSwell;
      mat.userData.shader = shader;

      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uReduced;
        uniform float uSwell;
        ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec2 uv = vMapUv;
          float t = uTime * (1.0 - uReduced);
          float sway = sin(uv.y * 8.0 + t * 1.2) * 0.005;
          float bob = sin(t * 0.9 + uSwell) * 0.004;
          vec4 sampledDiffuseColor = texture2D(map, clamp(vec2(uv.x + sway, uv.y + bob), 0.0, 1.0));
          sampledDiffuseColor.a *= 0.95 + sin(t * 1.0 + uSwell) * 0.05;
          diffuseColor *= sampledDiffuseColor;
        #endif
        `
      );
    };
    mat.customProgramCacheKey = () => 'island-wake-uv-only-v1';
    return mat;
  }

  /**
   * Cloth wind — UV warp like water flow, but pinned at the hoist (left)
   * and rippling horizontally toward the free end.
   */
  function makeFlagMaterial(tex, opts) {
    const options = opts || {};
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    mat.userData.uTime = { value: 0 };
    mat.userData.uReduced = { value: reducedMotion ? 1 : 0 };
    mat.userData.uSpeed = { value: options.speed == null ? 1.15 : options.speed };
    mat.userData.uAmp = { value: options.amp == null ? 1 : options.amp };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = mat.userData.uTime;
      shader.uniforms.uReduced = mat.userData.uReduced;
      shader.uniforms.uSpeed = mat.userData.uSpeed;
      shader.uniforms.uAmp = mat.userData.uAmp;
      mat.userData.shader = shader;

      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uReduced;
        uniform float uSpeed;
        uniform float uAmp;
        ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec2 uv = vMapUv;
          float t = uTime * (1.0 - uReduced) * uSpeed;
          // Pin hoist (left edge); free end flutters more.
          float pin = smoothstep(0.02, 0.22, uv.x);
          float tip = pin * pin;

          float w1 = sin(uv.x * 9.5 - t * 2.35 + uv.y * 2.8);
          float w2 = sin(uv.x * 17.0 - t * 3.55 + uv.y * 5.5 + 1.3);
          float w3 = sin(uv.x * 28.0 - t * 4.8 + uv.y * 9.0);
          float flutter = sin(uv.y * 16.0 + t * 2.2) * uv.x;

          vec2 warp = vec2(
            (w1 * 0.004 + w2 * 0.0025) * tip,
            (w1 * 0.018 + w2 * 0.010 + w3 * 0.005 + flutter * 0.006) * tip
          ) * uAmp;

          vec4 sampledDiffuseColor = texture2D(map, clamp(uv + warp, 0.0, 1.0));
          // Soft fold shade so the cloth reads as waving, not scrolling water.
          float fold = 0.92 + 0.08 * sin(uv.x * 11.0 - t * 2.1 + uv.y * 3.0);
          sampledDiffuseColor.rgb *= mix(1.0, fold, tip);
          diffuseColor *= sampledDiffuseColor;
        #endif
        `
      );
    };
    mat.customProgramCacheKey = () => 'island-flag-cloth-uv-v1';
    return mat;
  }

  /**
   * Cascade flow via UV distortion only (no gloss).
   * Stronger top→bottom warp; clearest texture scroll in the upper ~40%.
   */
  function makeWaterfallMaterial(srcTex, opts) {
    const options = opts || {};
    const mat = new THREE.MeshBasicMaterial({
      map: srcTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    mat.userData.uTime = { value: 0 };
    mat.userData.uReduced = { value: reducedMotion ? 1 : 0 };
    mat.userData.uSpeed = { value: options.speed == null ? 0.85 : options.speed };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = mat.userData.uTime;
      shader.uniforms.uReduced = mat.userData.uReduced;
      shader.uniforms.uSpeed = mat.userData.uSpeed;
      mat.userData.shader = shader;

      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uReduced;
        uniform float uSpeed;
        float wfHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wfNoise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p);
          float a = wfHash(i), b = wfHash(i + vec2(1.0, 0.0));
          float c = wfHash(i + vec2(0.0, 1.0)), d = wfHash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec2 uv = vMapUv;
          float t = uTime * (1.0 - uReduced);
          // Mid-band only: ~30% → 70% of the sheet, soft blend at both edges.
          float midBand = smoothstep(0.28, 0.38, uv.y) * (1.0 - smoothstep(0.62, 0.72, uv.y));
          // Light fall warp still runs full height so the cascade feels continuous.
          float fall = 0.25 + 0.75 * midBand;

          float n1 = wfNoise(vec2(uv.x * 6.0, uv.y * 14.0 - t * uSpeed * 2.4));
          float n2 = wfNoise(vec2(uv.x * 16.0, uv.y * 30.0 - t * uSpeed * 3.6));
          float n3 = wfNoise(vec2(uv.x * 32.0 + t * 0.2, uv.y * 9.0 - t * uSpeed * 1.5));

          vec2 distort = vec2(
            (n1 - 0.5) * 0.006 + (n3 - 0.5) * 0.003 + sin(uv.y * 24.0 - t * 2.8) * 0.0018,
            (n2 - 0.5) * 0.0072 + sin(uv.x * 14.0 + t * 1.6) * 0.0012
          ) * fall;

          // Downward texture scroll blended only inside the 30–70% band (~40% quieter).
          float scroll = fract(t * uSpeed * 0.45);
          float scrollB = fract(t * uSpeed * 0.45 + 0.5);
          vec2 flowA = distort + vec2(0.0, -scroll * 0.036 * midBand);
          vec2 flowB = distort + vec2((n1 - 0.5) * 0.0024 * midBand, -scrollB * 0.036 * midBand);
          float blend = abs(scroll * 2.0 - 1.0);
          vec2 sampleUv = mix(uv + flowA, uv + flowB, blend);
          sampleUv = clamp(sampleUv, vec2(0.02, 0.0), vec2(0.98, 1.0));

          vec4 sampledDiffuseColor = texture2D(map, sampleUv);

          // Soft flowing streaks (the earlier waterfall feel) — no hard highlight bands / foam gloss.
          float fine = wfNoise(vec2(uv.x * 26.0, uv.y * 8.0 + t * uSpeed * 2.6));
          float coarse = wfNoise(vec2(uv.x * 12.0, uv.y * 4.5 + t * uSpeed * 1.5));
          float streak = mix(coarse, fine, 0.55);
          float flow = 1.0 + (streak - 0.5) * 0.28 * (0.55 + 0.45 * midBand);
          sampledDiffuseColor.rgb *= flow;

          diffuseColor *= sampledDiffuseColor;
        #endif
        `
      );
    };
    mat.customProgramCacheKey = () => 'island-waterfall-uv-flow-v5';
    return mat;
  }

  /**
   * Pool / landing spray (waterfall-02) — stronger bottom wash + soft flow
   * so the sheet clearly moves where water settles.
   */
  function makeWaterfallPoolMaterial(srcTex) {
    const mat = new THREE.MeshBasicMaterial({
      map: srcTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    mat.userData.uTime = { value: 0 };
    mat.userData.uReduced = { value: reducedMotion ? 1 : 0 };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = mat.userData.uTime;
      shader.uniforms.uReduced = mat.userData.uReduced;
      mat.userData.shader = shader;

      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uReduced;
        float poolHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float poolNoise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p);
          float a = poolHash(i), b = poolHash(i + vec2(1.0, 0.0));
          float c = poolHash(i + vec2(0.0, 1.0)), d = poolHash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec2 uv = vMapUv;
          float t = uTime * (1.0 - uReduced);
          // Bottom-weighted motion (strongest near the landing edge).
          float bottom = 1.0 - smoothstep(0.0, 0.55, uv.y);
          float mid = smoothstep(0.15, 0.4, uv.y) * (1.0 - smoothstep(0.55, 0.85, uv.y));
          float zone = max(bottom, mid * 0.65);

          float n1 = poolNoise(uv * vec2(14.0, 8.0) + vec2(t * 0.35, -t * 0.55));
          float n2 = poolNoise(uv * vec2(28.0, 14.0) - vec2(t * 0.28, t * 0.7));
          float n3 = poolNoise(uv * vec2(40.0, 18.0) + vec2(-t * 0.4, t * 0.9));
          float wash = sin(uv.x * 5.0 + t * 1.1 + n1 * 3.0) * 0.5 + 0.5;
          float wash2 = sin(uv.x * 9.0 - t * 0.85 + n2 * 2.5) * 0.5 + 0.5;
          float lap = mix(wash, wash2, 0.45);

          vec2 distort = vec2(
            (n1 - 0.5) * 0.025 + sin(uv.y * 28.0 + t * 1.6 + n1 * 4.0) * 0.0107 + (n3 - 0.5) * 0.0078,
            (lap - 0.5) * 0.0358 + (n2 - 0.5) * 0.0179 + sin(t * 1.3 + uv.x * 6.0) * 0.009 + (n3 - 0.5) * 0.0059
          ) * zone;

          // Soft dual-phase scroll in the active zone so texture clearly drifts.
          float scroll = fract(t * 0.32);
          float scrollB = fract(t * 0.32 + 0.5);
          vec2 flowA = distort + vec2((n3 - 0.5) * 0.0072, -scroll * 0.0715) * zone;
          vec2 flowB = distort + vec2((n1 - 0.5) * 0.0053, -scrollB * 0.0715) * zone;
          float blend = abs(scroll * 2.0 - 1.0);
          vec2 sampleUv = clamp(mix(uv + flowA, uv + flowB, blend), vec2(0.01, 0.0), vec2(0.99, 1.0));

          vec4 sampledDiffuseColor = texture2D(map, sampleUv);
          // Gentle streak (no gloss bands) so the foam also feels alive.
          float streak = mix(n1, n2, 0.5);
          sampledDiffuseColor.rgb *= 1.0 + (streak - 0.5) * 0.39 * zone;
          diffuseColor *= sampledDiffuseColor;
        #endif
        `
      );
    };
    mat.customProgramCacheKey = () => 'island-waterfall-pool-v5';
    return mat;
  }

  /**
   * Corner foliage: sway only the leafy upper half on the outer side.
   * Rocks/sand (bottom ~50%) stay still. Motion is biased inward so the
   * hard-cropped PNG edge doesn't swing into view.
   * @param {number} side -1 = left overlay, +1 = right overlay
   */
  function makeOverlayFoliageMaterial(tex, side) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    mat.userData.uTime = { value: 0 };
    mat.userData.uReduced = { value: reducedMotion ? 1 : 0 };
    mat.userData.uSide = { value: side < 0 ? 0 : 1 };

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = mat.userData.uTime;
      shader.uniforms.uReduced = mat.userData.uReduced;
      shader.uniforms.uSide = mat.userData.uSide;
      mat.userData.shader = shader;

      shader.vertexShader =
        `
        uniform float uTime;
        uniform float uReduced;
        uniform float uSide;
        ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        {
          float t = uTime * (1.0 - uReduced);
          // v=0 bottom (rocks), v=1 top (leaves) — only animate above ~50%.
          float leafH = smoothstep(0.48, 0.78, uv.y);
          // Left: outer leaves on low u; right: outer leaves on high u.
          float leafS = uSide < 0.5
            ? (1.0 - smoothstep(0.15, 0.62, uv.x))
            : smoothstep(0.38, 0.85, uv.x);
          float amp = leafH * leafS;
          // ~20% stronger than the old whole-mesh rotation (~0.007–0.008).
          float wave = sin(t * 1.35 + uv.y * 5.5 + uSide * 1.7) * 0.0024;
          float tip = cos(t * 1.05 + uv.y * 3.2) * 0.00108;
          // Always bias displacement toward scene center so the cut edge stays off-frame.
          float inward = uSide < 0.5 ? 1.0 : -1.0;
          transformed.x += wave * amp * inward;
          transformed.y += tip * amp;
        }
        `
      );
    };
    mat.customProgramCacheKey = () => 'island-overlay-leaf-sway-v3-' + (side < 0 ? 'L' : 'R');
    return mat;
  }

  function particleTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function makeShadowTex() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 32, 4, 128, 32, 122);
    g.addColorStop(0, 'rgba(2,22,30,.62)');
    g.addColorStop(0.5, 'rgba(3,32,42,.32)');
    g.addColorStop(1, 'rgba(3,35,45,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function makeSeagullTex() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(8, 36);
    ctx.quadraticCurveTo(22, 14, 32, 32);
    ctx.quadraticCurveTo(42, 14, 56, 36);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const BIRD_FILES = [
    'assets/birds/bird-1.png',
    'assets/birds/bird-2.png',
  ];

  async function loadBirdTextures() {
    try {
      const texes = await Promise.all(BIRD_FILES.map((f) => loadTex(f)));
      return texes.length ? texes : [makeSeagullTex()];
    } catch (_) {
      return [makeSeagullTex()];
    }
  }

  /** Soft white points — per-particle aFade (0..1) fades them as they fall. */
  function makeSoftPointsMaterial(sizePx, peakOpacity) {
    const mat = new THREE.PointsMaterial({
      map: particleTex(),
      color: 0xeaf6ff,
      size: sizePx,
      transparent: true,
      opacity: peakOpacity,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: false,
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        `
        attribute float aFade;
        varying float vFade;
        ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vFade = aFade;
        `
      );
      shader.fragmentShader =
        `
        varying float vFade;
        ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        diffuseColor.a *= clamp(vFade, 0.0, 1.0);
        `
      );
    };
    mat.customProgramCacheKey = () => 'island-soft-points-fade-v2';
    return mat;
  }

  function createMist(origin, count) {
    const positions = new Float32Array(count * 3);
    const fades = new Float32Array(count);
    const velocities = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.06;
      positions[i * 3 + 1] = origin.y + Math.random() * 0.04;
      positions[i * 3 + 2] = origin.z;
      fades[i] = Math.random();
      velocities.push({
        vx: (Math.random() - 0.5) * 0.015,
        vy: 0.01 + Math.random() * 0.025,
        life: Math.random(),
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fades, 1));
    const pts = new THREE.Points(geo, makeSoftPointsMaterial(8, 0.14));
    pts.renderOrder = 1200;
    pts.userData = { velocities, origin };
    return pts;
  }

  /** Tiny white droplets falling along the cascade face. */
  function createWaterfallDroplets(top, bottom, count) {
    const positions = new Float32Array(count * 3);
    const fades = new Float32Array(count);
    const velocities = [];
    const spanY = Math.max(0.04, top.y - bottom.y);
    for (let i = 0; i < count; i++) {
      const life = Math.random();
      positions[i * 3] = top.x + (Math.random() - 0.5) * 0.045;
      positions[i * 3 + 1] = top.y - life * spanY;
      positions[i * 3 + 2] = top.z;
      // Fade out toward the bottom of the fall.
      fades[i] = Math.max(0, 1 - life);
      velocities.push({
        vx: (Math.random() - 0.5) * 0.012,
        vy: -(0.045 + Math.random() * 0.07),
        life,
        phase: Math.random() * Math.PI * 2,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fades, 1));
    const pts = new THREE.Points(geo, makeSoftPointsMaterial(4, 0.42));
    pts.renderOrder = 1201;
    pts.userData = { velocities, top, bottom, spanY };
    return pts;
  }

  /**
   * Arc droplets: spawn at the bottom of waterfall-01, fly a short parabola,
   * and land on waterfall-02. Uses real vx/vy + gravity so motion is obvious.
   */
  function createArcSplash(start, end, count) {
    const positions = new Float32Array(count * 3);
    const fades = new Float32Array(count);
    const particles = [];

    function seed(p, randomizeAge) {
      p.x0 = start.x + (Math.random() - 0.5) * 0.028;
      p.y0 = start.y + (Math.random() - 0.5) * 0.01;
      // Aim toward the spray sheet with a sideways fan.
      const tx = end.x + (Math.random() - 0.5) * 0.08 - p.x0;
      const ty = end.y + (Math.random() - 0.5) * 0.03 - p.y0;
      const flight = 0.55 + Math.random() * 0.45; // seconds
      // Initial upward kick so the path reads as a parabola, then gravity pulls down.
      p.vx = tx / flight + (Math.random() - 0.5) * 0.04;
      p.vy = Math.max(0.02, ty / flight) + 0.06 + Math.random() * 0.08;
      p.g = 0.28 + Math.random() * 0.18;
      p.age = randomizeAge ? Math.random() * flight : 0;
      p.life = flight;
      p.x = p.x0;
      p.y = p.y0;
    }

    for (let i = 0; i < count; i++) {
      const p = { x: 0, y: 0, x0: 0, y0: 0, vx: 0, vy: 0, g: 0, age: 0, life: 1 };
      seed(p, true);
      // Advance once so randomized particles aren't all stacked at spawn.
      p.x = p.x0 + p.vx * p.age;
      p.y = p.y0 + p.vy * p.age - 0.5 * p.g * p.age * p.age;
      particles.push(p);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = start.z;
      const u = p.age / p.life;
      fades[i] = u < 0.1 ? u / 0.1 : u > 0.7 ? Math.max(0, 1 - (u - 0.7) / 0.3) : 0.85;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fades, 1));
    // ~50% of previous brightness.
    const pts = new THREE.Points(geo, makeSoftPointsMaterial(5, 0.3));
    pts.renderOrder = 1202;
    pts.userData = { particles, start, end, seed };
    return pts;
  }

  function syncRipples() {
    if (!waterMat || !waterMat.userData.uRipples) return;
    const arr = waterMat.userData.uRipples.value;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      if (r) arr[i].set(r.u, r.v, r.t, r.strength);
      else arr[i].set(0, 0, -10, 0);
    }
  }

  function pushRipple(u, v, strength) {
    if (reducedMotion) return;
    const t = clock.getElapsedTime();
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ u, v, t, strength });
    syncRipples();
  }

  function computeCover() {
    const stage = document.getElementById('stage');
    const rect = stage ? stage.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
    const vw = rect.width;
    const vh = rect.height;
    // Stretch-to-fill: the whole illustration maps to the whole stage (no crop, no gaps).
    view.scaleX = (vw / ART_W) * VIEW_ZOOM;
    view.scaleY = (vh / ART_H) * VIEW_ZOOM;
    view.ox = rect.left;
    view.oy = rect.top;
    return view;
  }

  function artToScreen(ax, ay) {
    computeCover();
    return {
      left: view.ox + ax * view.scaleX,
      top: view.oy + ay * view.scaleY,
    };
  }

  /**
   * Art -> coordinates relative to the stage's own top-left. Hotspots and the
   * route SVG are children of #stage, so they must NOT include the stage's
   * viewport offset (which breaks once the stage is centered, e.g. dev phone frame).
   */
  function artToStage(ax, ay) {
    computeCover();
    return {
      left: ax * view.scaleX,
      top: ay * view.scaleY,
    };
  }

  function screenToArt(clientX, clientY) {
    computeCover();
    return {
      x: (clientX - view.ox) / view.scaleX,
      y: (clientY - view.oy) / view.scaleY,
    };
  }

  function positionHotspots() {
    Object.keys(HOTSPOTS).forEach((id) => {
      const el = document.querySelector(`.hotspot[data-spot="${id}"]`);
      if (!el) return;
      const h = HOTSPOTS[id];
      const s = artToStage(h.x, h.y);
      el.style.left = `${s.left}px`;
      el.style.top = `${s.top}px`;
      // Origin is the circle center; board extends to the right from here.
      el.style.transform = `translate(-50%, -50%)`;
      if (h.numberScale != null) el.style.setProperty('--spot-nb-scale', String(h.numberScale));
      if (h.textScale != null) el.style.setProperty('--spot-tb-scale', String(h.textScale));
    });
  }

  function updateRoute() {
    const svg = document.getElementById('route-svg');
    const path = document.getElementById('route-path');
    if (!svg || !path) return;
    const stage = document.getElementById('stage');
    const vw = stage ? stage.clientWidth : window.innerWidth;
    const vh = stage ? stage.clientHeight : window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    const [a, b, c, d, e] = [1, 3, 2, 5, 4].map((id) => {
      const h = HOTSPOTS[id];
      return artToStage(h.x, h.y);
    });
    path.setAttribute(
      'd',
      `M${a.left},${a.top} Q${(a.left + b.left) / 2},${a.top - 40} ${b.left},${b.top} ` +
        `Q${(b.left + c.left) / 2},${(b.top + c.top) / 2 - 30} ${c.left},${c.top} ` +
        `Q${(c.left + d.left) / 2},${(c.top + d.top) / 2 + 40} ${d.left},${d.top} ` +
        `Q${(d.left + e.left) / 2},${(d.top + e.top) / 2 + 20} ${e.left},${e.top}`
    );
  }

  async function init() {
    const canvas = document.getElementById('island-canvas');
    const stage = document.getElementById('stage');
    if (!canvas || !stage || typeof THREE === 'undefined') {
      setBootProgress(100, 'Unable to start the scene');
      revealSite();
      return;
    }

    setBootProgress(2, 'Reading layout config…');
    await loadConfigs();

    setBootProgress(4, 'Preparing the voyage…');
    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (_) {
        /* ignore font wait failures */
      }
    }

    clock = new THREE.Clock();
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    // Layers use ascending z; keep the camera well past the front-most plane
    // so added props (waves/overlays) never end up behind the camera.
    camera.position.z = 40;

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x6ec8ff, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    artRoot = new THREE.Group();
    scene.add(artRoot);

    // Load textures
    const files = [
      LAYOUT.bg.file,
      ...LAYOUT.backClouds.map((c) => c.file),
      LAYOUT.water.file,
      LAYOUT.shadow.file,
      ...LAYOUT.props.map((p) => p.file),
      ...LAYOUT.foregroundProps.map((p) => p.file),
      ...LAYOUT.overlays.map((p) => p.file),
    ];
    const texMap = {};
    let loadedCount = 0;
    setBootProgress(8, 'Loading island art…');
    await Promise.all(
      files.map(async (f) => {
        texMap[f] = await loadTex(f);
        loadedCount += 1;
        const pct = 8 + (loadedCount / files.length) * 82;
        setBootProgress(pct, `Loading island art… ${loadedCount}/${files.length}`);
      })
    );
    setBootProgress(92, 'Compositing the scene…');

    let z = -5;
    artRoot.add(makePlane(texMap[LAYOUT.bg.file], LAYOUT.bg, z++));

    // Three separate background cloud layers (drawn back → front as listed).
    cloudMeshes = [];
    LAYOUT.backClouds.forEach((c) => {
      const mesh = makePlane(texMap[c.file], c, z++);
      // Overscan so slow parallax drift never reveals the plane edges against the sky.
      mesh.scale.x = c.scaleX == null ? 1 : Number(c.scaleX);
      mesh.scale.y = c.scaleY == null ? 1 : Number(c.scaleY);
      mesh.userData.baseX = mesh.position.x;
      mesh.userData.drift = c.drift == null ? 0.045 : Number(c.drift);
      mesh.userData.amp = c.amp == null ? 0.07 : Number(c.amp);
      mesh.userData.phase = cloudMeshes.length * 1.7;
      artRoot.add(mesh);
      cloudMeshes.push(mesh);
    });

    waterMat = makeWaterMaterial(texMap[LAYOUT.water.file]);
    artRoot.add(makePlane(texMap[LAYOUT.water.file], LAYOUT.water, z++, waterMat));

    // Framing layers: pivot from an outer corner so grow bleeds into the scene.
    // sx/sy: -1 left/bottom, +1 right/top. grow/margin come from assets/scene/layout.json.
    const FRAME_ANCHORS = {
      palmL: { sx: -1, sy: 1 },
      palmR2: { sx: 1, sy: 1 },
      palmR1: { sx: 1, sy: 1 },
      overlayL: { sx: -1, sy: -1 },
      overlayR: { sx: 1, sy: -1 },
    };

    function applyFrameAnchor(mesh, p, anchor) {
      const loc = pxToLocal(p.x, p.y, p.w, p.h);
      const hw = loc.w / 2;
      const hh = loc.h / 2;
      const grow = (p.grow == null ? 1.1 : Number(p.grow)) * (p.scale == null ? 1 : Number(p.scale));
      const margin = p.margin == null ? 0.05 : Number(p.margin);
      mesh.geometry.translate(-anchor.sx * hw, -anchor.sy * hh, 0);
      mesh.position.set(
        loc.x + anchor.sx * hw + anchor.sx * margin,
        loc.y + anchor.sy * hh + anchor.sy * margin,
        mesh.position.z
      );
      mesh.scale.set(grow, grow, 1);
      mesh.userData.anchored = true;
    }

    LAYOUT.props.forEach((p) => {
      let mat;
      if (p.id === 'wake') {
        mat = makeWakeMaterial(texMap[p.file]);
        waveMats.push(mat);
        wakeMat = mat;
      } else if (p.id === 'waterfall') {
        mat = makeWaterfallMaterial(texMap[p.file], { speed: 0.9 });
        waterfallMats.push(mat);
      } else if (p.id === 'waterfallSpray') {
        // Beach-like pool wash where the fall lands (quieter than ocean shore).
        mat = makeWaterfallPoolMaterial(texMap[p.file]);
        waterfallMats.push(mat);
      } else if (p.id === 'flagShip' || p.id === 'flagFort' || p.id === 'flagVillage') {
        mat = makeFlagMaterial(texMap[p.file], {
          speed: p.id === 'flagShip' ? 1.35 : p.id === 'flagFort' ? 1.1 : 1.0,
          amp: p.id === 'flagShip' ? 1.15 : 1.0,
        });
        flagMats.push(mat);
      }
      const mesh = makePlane(texMap[p.file], p, z++);
      if (mat) mesh.material = mat;
      mesh.userData.id = p.id;

      const anchor = FRAME_ANCHORS[p.id];
      if (anchor) applyFrameAnchor(mesh, p, anchor);

      mesh.userData.basePos = mesh.position.clone();
      artRoot.add(mesh);
      propMeshes[p.id] = mesh;
      if (LANDMARK_IDS.has(p.id)) {
        mesh.userData.landmarkGrow = LANDMARK_GROW * (p.scale == null ? 1 : Number(p.scale));
        landmarkMeshes.push(mesh);
      }
      if (p.id === 'ship') shipMesh = mesh;
      if (p.id === 'mountain') mountainMesh = mesh;
      if (p.id.startsWith('palm')) palmMeshes.push(mesh);
    });

    // Ship wake sits just in front of the hull at the waterline.
    if (propMeshes.wake && shipMesh) {
      propMeshes.wake.position.z = shipMesh.position.z + 0.35;
      propMeshes.wake.userData.basePos = propMeshes.wake.position.clone();
    }
    // Cascade / spray sit just in front of the cliff; shore waves in front of both.
    if (propMeshes.waterfall && mountainMesh) {
      propMeshes.waterfall.position.z = mountainMesh.position.z + 0.15;
      propMeshes.waterfall.userData.basePos = propMeshes.waterfall.position.clone();
    }
    if (propMeshes.waterfallSpray && mountainMesh) {
      propMeshes.waterfallSpray.position.z = mountainMesh.position.z + 0.25;
      propMeshes.waterfallSpray.userData.basePos = propMeshes.waterfallSpray.position.clone();
    }
    if (propMeshes.fortWaves && propMeshes.fort) {
      propMeshes.fortWaves.position.z = propMeshes.fort.position.z + 0.4;
      propMeshes.fortWaves.userData.basePos = propMeshes.fortWaves.position.clone();
    }
    // Flags sit just in front of their parent landmarks.
    [
      ['flagShip', 'ship'],
      ['flagVillage', 'village'],
      ['flagFort', 'fort'],
    ].forEach(([flagId, parentId]) => {
      if (propMeshes[flagId] && propMeshes[parentId]) {
        propMeshes[flagId].position.z = propMeshes[parentId].position.z + 0.2;
        propMeshes[flagId].userData.basePos = propMeshes[flagId].position.clone();
      }
    });

    // Soft waterline shadow grounds the ship without darkening its artwork.
    if (shipMesh) {
      const shipLayer = LAYOUT.props.find((p) => p.id === 'ship');
      let shadowPx = { x: 160, y: 500, w: 280, h: 50 };
      if (shipLayer) {
        const sw = Number(shipLayer.w) * (shipLayer.scale == null ? 1 : Number(shipLayer.scale));
        const sh = Number(shipLayer.h) * (shipLayer.scale == null ? 1 : Number(shipLayer.scale));
        shadowPx = {
          x: Number(shipLayer.x) + sw * 0.12,
          y: Number(shipLayer.y) + sh * 0.72,
          w: sw * 0.68,
          h: Math.max(36, sh * 0.14),
        };
      }
      const shadowLoc = pxToLocal(shadowPx.x, shadowPx.y, shadowPx.w, shadowPx.h);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: makeShadowTex(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      shipShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(shadowLoc.w, shadowLoc.h),
        shadowMat
      );
      shipShadow.position.set(shadowLoc.x, shadowLoc.y, shipMesh.position.z - 0.04);
      shipShadow.userData.basePos = shipShadow.position.clone();
      shipShadow.userData.landmarkGrow = LANDMARK_GROW;
      artRoot.add(shipShadow);
    }

    syncLandmarkAspect();

    // Corner foliage framing (must stay below camera.z).
    // Leaf sway is vertex-warped (upper/outer only); rocks stay planted.
    LAYOUT.overlays.forEach((p, i) => {
      const side = p.id === 'overlayL' ? -1 : 1;
      const mat = makeOverlayFoliageMaterial(texMap[p.file], side);
      const s = p.scale == null ? 1 : Number(p.scale);
      const loc = pxToLocal(p.x, p.y, p.w * s, p.h * s);
      const anchor = FRAME_ANCHORS[p.id];
      const grow = (p.grow == null ? 1.12 : Number(p.grow)) * s;
      const margin = p.margin == null ? 0.035 : Number(p.margin);
      const geo = new THREE.PlaneGeometry(loc.w, loc.h, 24, 32);
      if (anchor) {
        geo.translate(-anchor.sx * (loc.w / 2), -anchor.sy * (loc.h / 2), 0);
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(loc.x, loc.y, z++);
      mesh.userData.id = p.id;
      mesh.renderOrder = 1000 + i;
      if (anchor) {
        const hw = loc.w / 2;
        const hh = loc.h / 2;
        mesh.position.set(
          loc.x + anchor.sx * hw + anchor.sx * margin,
          loc.y + anchor.sy * hh + anchor.sy * margin,
          mesh.position.z
        );
        mesh.scale.set(grow, grow, 1);
        mesh.userData.anchored = true;
      }
      mesh.userData.basePos = mesh.position.clone();
      mesh.userData.foliageMat = mat;
      artRoot.add(mesh);
      propMeshes[p.id] = mesh;
    });

    // Foreground landmarks (e.g. treasure) sit above corner overlays.
    LAYOUT.foregroundProps.forEach((p) => {
      const mesh = makePlane(texMap[p.file], p, z++);
      mesh.userData.id = p.id;
      mesh.userData.basePos = mesh.position.clone();
      mesh.renderOrder = 1100;
      artRoot.add(mesh);
      propMeshes[p.id] = mesh;
      if (LANDMARK_IDS.has(p.id)) {
        mesh.userData.landmarkGrow = LANDMARK_GROW * (p.scale == null ? 1 : Number(p.scale));
        landmarkMeshes.push(mesh);
      }
    });
    syncLandmarkAspect();

    // Arc droplets: leave the bottom of waterfall-01 and land on waterfall-02.
    if (propMeshes.waterfall && propMeshes.waterfallSpray) {
      const wf = propMeshes.waterfall;
      const spray = propMeshes.waterfallSpray;
      const frontZ = spray.position.z + 0.5;
      // Bottom edge of the cascade sheet.
      const start = new THREE.Vector3(
        wf.position.x,
        wf.position.y - wf.geometry.parameters.height * 0.48,
        frontZ
      );
      // Onto the spray / pool sheet.
      const end = new THREE.Vector3(
        spray.position.x,
        spray.position.y - spray.geometry.parameters.height * 0.35,
        frontZ
      );
      splashPoints = createArcSplash(start, end, reducedMotion ? 10 : 52);
      artRoot.add(splashPoints);

      mistPoints = createMist(
        new THREE.Vector3(end.x, end.y - 0.01, frontZ),
        reducedMotion ? 6 : 22
      );
      artRoot.add(mistPoints);
    } else if (propMeshes.waterfallSpray) {
      const spray = propMeshes.waterfallSpray;
      const frontZ = spray.position.z + 0.5;
      mistPoints = createMist(
        new THREE.Vector3(spray.position.x, spray.position.y, frontZ),
        reducedMotion ? 6 : 24
      );
      artRoot.add(mistPoints);
    } else if (propMeshes.waterfall) {
      const wf = propMeshes.waterfall;
      mistPoints = createMist(
        new THREE.Vector3(wf.position.x, wf.position.y - wf.geometry.parameters.height * 0.35, wf.position.z + 0.4),
        reducedMotion ? 6 : 28
      );
      artRoot.add(mistPoints);
    } else if (mountainMesh) {
      const mistOrigin = new THREE.Vector3(
        mountainMesh.position.x - 0.12,
        mountainMesh.position.y - 0.05,
        mountainMesh.position.z + 0.05
      );
      mistPoints = createMist(mistOrigin, reducedMotion ? 6 : 36);
      artRoot.add(mistPoints);
    }

    // Birds — assets/birds sprites; fall back to drawn seagull.
    const birdTexes = await loadBirdTextures();
    // Birds render behind all props (z=-3.9), so paths stay in open sky:
    // left of the title board and along the horizon band below it.
    const birdPaths = [
      { cx: -0.66, cy: 0.71, rx: 0.14, ry: 0.05, speed: 0.15, phase: 0 },
      { cx: -0.55, cy: 0.54, rx: 0.12, ry: 0.04, speed: 0.18, phase: 1.5 },
      { cx: -0.08, cy: 0.3, rx: 0.22, ry: 0.025, speed: 0.12, phase: 2.6 },
    ];
    birdPaths.forEach((path, i) => {
      const tex = birdTexes[i % birdTexes.length];
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      // Size from the sprite's own pixel dimensions (flock images are wide).
      const img = tex.image;
      const px = img && img.width ? { w: img.width, h: img.height } : { w: 90, h: 40 };
      const spriteScale = 0.54;
      const bird = new THREE.Mesh(
        new THREE.PlaneGeometry((px.w * spriteScale) / 960, (px.h * spriteScale) / 480),
        mat
      );
      bird.userData.path = path;
      // Sprites face right; flip when velocity is leftward.
      bird.userData.facesRight = true;
      bird.userData.baseScaleX = 1;
      // Behind everything except the sky/clouds backdrop (bg z=-5, clouds z=-4).
      bird.position.z = -3.9;
      artRoot.add(bird);
      seagulls.push(bird);
    });

    // Full-frame shadow.png vignette — topmost scene layer (HTML UI stays above canvas).
    const sceneShadowMesh = makePlane(texMap[LAYOUT.shadow.file], LAYOUT.shadow, z++);
    sceneShadowMesh.renderOrder = 2000;
    sceneShadowMesh.userData.id = 'sceneShadow';
    artRoot.add(sceneShadowMesh);

    resize();
    positionHotspots();
    updateRoute();

    const onViewportChange = () => {
      resize();
      positionHotspots();
      updateRoute();
    };
    window.addEventListener('resize', onViewportChange);

    // Swapping between the desktop (1920x960) and portrait (1080x1920) scenes
    // needs a full rebuild — reload once when the viewport crosses the boundary.
    let reloadingForBreakpoint = false;
    window.addEventListener('resize', () => {
      if (reloadingForBreakpoint) return;
      if (isMobileViewport() !== usingMobileScene) {
        reloadingForBreakpoint = true;
        window.location.reload();
      }
    });
    if ('ResizeObserver' in window) {
      const stageObserver = new ResizeObserver(() => {
        resize();
        positionHotspots();
        updateRoute();
      });
      stageObserver.observe(stage);
    }

    let lastRipple = 0;
    stage.addEventListener('pointermove', (e) => {
      const art = screenToArt(e.clientX, e.clientY);
      if (art.x < 0 || art.y < 0 || art.x > ART_W || art.y > ART_H) return;
      // Water hit band in art space; UVs map across the water layer plane.
      const wy = WATER_HIT.y;
      const wh = WATER_HIT.h;
      if (art.y >= wy && art.y <= wy + wh && waterMat) {
        const u = art.x / ART_W;
        const v = 1 - (art.y - wy) / wh;
        waterMat.userData.uMouse.value.set(u, v);
        const now = performance.now();
        if (!reducedMotion && now - lastRipple > 280) {
          lastRipple = now;
          pushRipple(u, Math.min(1, Math.max(0, v)), 0.22);
        }
      }
    });
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.hotspot, .contact-btn, .panel, a, button')) return;
      const art = screenToArt(e.clientX, e.clientY);
      const wy = WATER_HIT.y;
      const wh = WATER_HIT.h;
      if (art.y >= wy && art.y <= wy + wh) {
        const u = art.x / ART_W;
        const v = 1 - (art.y - wy) / wh;
        pushRipple(u, Math.min(1, Math.max(0, v)), 0.4);
      }
    });

    document.addEventListener('visibilitychange', () => {
      const visible = document.visibilityState === 'visible';
      if (visible && !running) {
        running = true;
        clock.getDelta();
        animate();
      } else if (!visible) {
        running = false;
        cancelAnimationFrame(animId);
      }
    });

    // Paint one frame with all textures uploaded before revealing the UI.
    setBootProgress(100, 'Ready');
    resize();
    positionHotspots();
    updateRoute();
    renderer.render(scene, camera);
    requestAnimationFrame(() => {
      renderer.render(scene, camera);
      revealSite();
      animate();
    });
  }

  function resize() {
    if (!renderer) return;
    const stage = document.getElementById('stage');
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);

    // Stretch-to-fill: art plane (x,y in [-1,1]) maps to the whole stage.
    camera.left = -1;
    camera.right = 1;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();
    syncLandmarkAspect();
  }

  function animate() {
    if (!running) return;
    animId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const dt = Math.min(clock.getDelta(), 0.05);

    if (waterMat) {
      waterMat.userData.uTime.value = t;
      syncRipples();
    }

    if (!reducedMotion) {
      // Slow, continuous parallax drift within the overscan margin (no visible edge).
      for (let i = 0; i < cloudMeshes.length; i++) {
        const cm = cloudMeshes[i];
        cm.position.x = cm.userData.baseX + Math.sin(t * cm.userData.drift + cm.userData.phase) * cm.userData.amp;
      }
      if (propMeshes.cloudFront) {
        // Front cloud drifts a touch faster than the backdrop for parallax depth.
        const cb = propMeshes.cloudFront.userData.basePos;
        propMeshes.cloudFront.position.x = cb.x + Math.sin(t * 0.06 + 1.7) * 0.05;
      }
      if (shipMesh) {
        const b = shipMesh.userData.basePos;
        // Layered low-frequency motion for a natural "sailing on water" feel:
        // roll (rotation), heave (vertical), and a gentle surge (horizontal).
        const roll = Math.sin(t * 0.5) * 0.6 + Math.sin(t * 0.83 + 1.3) * 0.4;
        const heave = Math.sin(t * 0.62) * 0.6 + Math.sin(t * 1.05 + 0.7) * 0.4;
        const surge = Math.sin(t * 0.28 + 0.5);
        shipMesh.rotation.z = roll * 0.02;
        shipMesh.position.y = b.y + heave * 0.008;
        shipMesh.position.x = b.x + surge * 0.006;
        if (shipShadow) {
          const sb = shipShadow.userData.basePos;
          // Shadow tracks the hull, shrinking as the ship lifts and skewing with the roll.
          shipShadow.position.x = sb.x + surge * 0.006 + roll * 0.004;
          shipShadow.position.y = sb.y + heave * 0.003;
          shipShadow.rotation.z = roll * 0.012;
          const lift = (heave + 1) * 0.5; // 0..1
          const baseSx = shipShadow.userData.baseScaleX || 1;
          shipShadow.scale.x = baseSx * (1 - lift * 0.06);
          shipShadow.material.opacity = 0.5 - lift * 0.12;
        }
        // Wake sits right under the hull, drifting just slightly with the ship.
        if (propMeshes.wake) {
          const wb = propMeshes.wake.userData.basePos;
          propMeshes.wake.position.x = wb.x + surge * 0.002;
          propMeshes.wake.position.y = wb.y + heave * 0.0015;
          if (wakeMat) wakeMat.userData.uSwell.value = heave;
        }
        if (propMeshes.flagShip) {
          // Rigidly attach the flag to the mast: rotate its offset from the
          // ship's pivot by the same roll angle, then add the same surge/heave.
          const fb = propMeshes.flagShip.userData.basePos;
          const theta = roll * 0.02;
          const dx = fb.x - b.x;
          const dy = fb.y - b.y;
          propMeshes.flagShip.position.x = b.x + surge * 0.006 + dx - theta * dy;
          propMeshes.flagShip.position.y = b.y + heave * 0.008 + dy + theta * dx;
          propMeshes.flagShip.rotation.z = theta;
        }
      }
      for (let i = 0; i < waveMats.length; i++) {
        waveMats[i].userData.uTime.value = t;
      }
      for (let i = 0; i < waterfallMats.length; i++) {
        waterfallMats[i].userData.uTime.value = t;
      }
      for (let i = 0; i < flagMats.length; i++) {
        flagMats[i].userData.uTime.value = t;
      }
      if (propMeshes.shipFar) {
        const b = propMeshes.shipFar.userData.basePos;
        propMeshes.shipFar.position.y = b.y + Math.sin(t * 0.8 + 1) * 0.004;
        propMeshes.shipFar.rotation.z = Math.sin(t * 0.7) * 0.015;
      }
      palmMeshes.forEach((p, i) => {
        // Gentle wind sway pivoting from the anchored off-screen corner.
        p.rotation.z = Math.sin(t * 0.7 + i * 1.3) * 0.012;
      });
      // Overlay leaf sway is driven in the foliage vertex shader (rocks stay fixed).
      ['overlayL', 'overlayR'].forEach((id) => {
        const m = propMeshes[id];
        if (m && m.userData.foliageMat) m.userData.foliageMat.userData.uTime.value = t;
      });

      seagulls.forEach((bird) => {
        const p = bird.userData.path;
        const a = t * p.speed + p.phase;
        bird.position.x = p.cx + Math.cos(a) * p.rx;
        bird.position.y = p.cy + Math.sin(a) * p.ry;
        // Face travel direction (sprites are drawn head-to-the-right).
        // x velocity on the ellipse: dx/dt = -sin(a) * rx * speed
        const vx = -Math.sin(a) * p.rx * p.speed;
        if (Math.abs(vx) > 1e-4) {
          const base = bird.userData.baseScaleX || 1;
          // Moving right → no flip; moving left → flip so head leads.
          bird.scale.x = vx > 0 ? base : -base;
        }
      });
    }

    // Waterfall particles always animate (even with reduced motion — they're subtle).
    if (mistPoints) {
      const pos = mistPoints.geometry.attributes.position;
      const fade = mistPoints.geometry.attributes.aFade;
      const vels = mistPoints.userData.velocities;
      const o = mistPoints.userData.origin;
      for (let i = 0; i < vels.length; i++) {
        const v = vels[i];
        v.life += dt * 0.4;
        pos.array[i * 3] += v.vx * dt;
        pos.array[i * 3 + 1] += v.vy * dt;
        const lf = Math.min(1, v.life);
        fade.array[i] = lf < 0.2 ? lf / 0.2 : 1 - (lf - 0.2) / 0.8;
        if (v.life > 1) {
          v.life = 0;
          pos.array[i * 3] = o.x + (Math.random() - 0.5) * 0.06;
          pos.array[i * 3 + 1] = o.y;
          fade.array[i] = 0;
        }
      }
      pos.needsUpdate = true;
      fade.needsUpdate = true;
    }

    if (splashPoints) {
      const pos = splashPoints.geometry.attributes.position;
      const fade = splashPoints.geometry.attributes.aFade;
      const particles = splashPoints.userData.particles;
      const seed = splashPoints.userData.seed;
      const z = splashPoints.userData.start.z;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.age += dt;
        p.vy -= p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const u = Math.min(1, p.age / p.life);
        pos.array[i * 3] = p.x;
        pos.array[i * 3 + 1] = p.y;
        pos.array[i * 3 + 2] = z;
        fade.array[i] = u < 0.1 ? u / 0.1 : u > 0.7 ? Math.max(0, 1 - (u - 0.7) / 0.3) : 0.85;
        if (p.age >= p.life || p.y < splashPoints.userData.end.y - 0.04) {
          seed(p, false);
          p.x = p.x0;
          p.y = p.y0;
          pos.array[i * 3] = p.x0;
          pos.array[i * 3 + 1] = p.y0;
          pos.array[i * 3 + 2] = z;
          fade.array[i] = 0;
        }
      }
      pos.needsUpdate = true;
      fade.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  async function boot() {
    try {
      await init();
    } catch (err) {
      console.error(err);
      setBootProgress(100, 'Something went wrong — showing the page anyway');
      revealSite();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
