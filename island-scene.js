/**
 * Quills Studios — Treasure Island scene
 * Composites assets/chops_001 layers using layout.json (matched to reference).
 */
(function () {
  'use strict';

  const ART_W = 1200;
  const ART_H = 1080;
  /** Exact cover prevents resolution-dependent gaps around the illustration. */
  const VIEW_ZOOM = 1;
  const CHOPS = 'assets/chops_001/';
  const MAX_RIPPLES = 8;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Pixel layout from template-match against web page ref.jpg */
  const LAYOUT = {
    bg: { file: '_0015_Layer-7.png', x: 0, y: 0, w: 1200, h: 1080 },
    clouds: { file: '_0014_Layer-8.png', x: 0, y: 88, w: 1200, h: 346 },
    water: { file: '_0013_water-Alpha.png', x: 0, y: 402, w: 1200, h: 542 },
    shadow: { file: '_0000_shadow.png', x: 0, y: 0, w: 1200, h: 1080 },
    props: [
      { file: '_0012_ship_02.png', x: 460, y: 387, w: 97, h: 90, id: 'shipFar' },
      { file: '_0007_mountain-without-waterfall.png', x: 680, y: 170, w: 515, h: 340, id: 'mountain' },
      { file: '_0007_waterfall-01.png', x: 858, y: 292, w: 95, h: 194, id: 'waterfall' },
      { file: '_0007_waterfall-02.png', x: 801, y: 413, w: 117, h: 66, id: 'waterfallSpray' },
      { file: 'mountain-waves.png', x: 652, y: 426, w: 581, h: 140, id: 'mountainWaves' },
      { file: '_0009_Layer-2.png', x: 61, y: 494, w: 310, h: 93, id: 'wake' },
      { file: '_0006_Layer-4.png', x: 397, y: 455, w: 407, h: 226, id: 'village' },
      { file: '_0010_ship.png', x: 57, y: 194, w: 311, h: 355, id: 'ship' },
      { file: '_0008_fort.png', x: 671, y: 617, w: 378, h: 235, id: 'fort' },
      { file: 'fort-waves.png', x: 605, y: 770, w: 511, h: 154, id: 'fortWaves' },
      { file: '_0011_treasure-box.png', x: 43, y: 651, w: 386, h: 247, id: 'treasure' },
      { file: '_0005_palm-tree-branch_03-left.png', x: 0, y: 0, w: 592, h: 321, id: 'palmL' },
      { file: '_0004_palm-branch-02-right.png', x: 772, y: 0, w: 425, h: 210, id: 'palmR2' },
      { file: '_0003_palm-branch-01-right.png', x: 1080, y: 57, w: 120, h: 181, id: 'palmR1' },
    ],
    // Corner foliage — reference-matched coords; drawn after vignette shadow.
    overlays: [
      { file: '_0002_overlay-left.png', x: 0, y: 673, w: 327, h: 407, id: 'overlayL' },
      { file: '_0001_overlay_right.png', x: 718, y: 402, w: 482, h: 678, id: 'overlayR' },
    ],
  };

  /**
   * Hotspot anchors in art pixels — matched to web page ref landmarks,
   * nudging toward wooden-sign placements from the UI layout ref.
   */
  const HOTSPOTS = {
    1: { x: 200, y: 300 }, // ship / casino
    2: { x: 820, y: 340 }, // waterfall / casual
    3: { x: 600, y: 540 }, // village / team
    4: { x: 230, y: 780 }, // treasure / tech
    5: { x: 860, y: 700 }, // fort / portfolio
  };

  let renderer, scene, camera, clock;
  let artRoot, view = { scaleX: 1, scaleY: 1, ox: 0, oy: 0 };
  let waterMat, wakeMat, cloudMesh, shipMesh, shipShadow, mountainMesh;
  let waveMats = [];
  let waterfallMats = [];
  let palmMeshes = [];
  let mistPoints, dropletPoints, splashPoints, seagulls = [];
  let ripples = [];
  let animId = 0;
  let running = true;
  const propMeshes = {};

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

  function loadTex(file) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        CHOPS + file,
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
    const loc = pxToLocal(layer.x, layer.y, layer.w, layer.h);
    const mat =
      material ||
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(loc.w, loc.h), mat);
    mesh.position.set(loc.x, loc.y, z);
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
   * Pool / landing spray — soft beach-like UV wash (same idea as the ocean shore,
   * lower amplitude) so it reads as water settling after the fall hits.
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
          // Stronger toward the lower half where water lands and washes out.
          float impact = 1.0 - smoothstep(0.15, 0.75, uv.y);
          float n1 = poolNoise(uv * vec2(18.0, 10.0) + vec2(t * 0.22, -t * 0.12));
          float n2 = poolNoise(uv * vec2(36.0, 16.0) - vec2(t * 0.16, t * 0.28));
          float wash = sin(uv.x * 4.2 + t * 0.75 + n1 * 2.0) * 0.5 + 0.5;
          float wash2 = sin(uv.x * 7.5 - t * 0.5 + n2 * 3.0) * 0.5 + 0.5;
          float lap = mix(wash, wash2, 0.4);
          float grain = (n1 - 0.5) * 0.0035 + (n2 - 0.5) * 0.0018;
          // ~half the beach shore amplitude — same feel, quieter.
          vec2 distort = vec2(
            sin(uv.y * 32.0 + t * 0.85 + n1 * 3.5) * impact * 0.0045 + grain * impact * 1.2,
            (lap - 0.5) * impact * 0.012 + grain * 0.5 + sin(t * 0.9 + uv.x * 5.0) * impact * 0.0035
          );
          vec4 sampledDiffuseColor = texture2D(map, clamp(uv + distort, 0.0, 1.0));
          diffuseColor *= sampledDiffuseColor;
        #endif
        `
      );
    };
    mat.customProgramCacheKey = () => 'island-waterfall-pool-v1';
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
      const s = artToScreen(h.x, h.y);
      el.style.left = `${s.left}px`;
      el.style.top = `${s.top}px`;
      el.style.transform = 'translate(-50%, -50%)';
    });
  }

  function updateRoute() {
    const svg = document.getElementById('route-svg');
    const path = document.getElementById('route-path');
    if (!svg || !path) return;
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    const [a, b, c, d, e] = [1, 3, 2, 5, 4].map((id) => {
      const h = HOTSPOTS[id];
      return artToScreen(h.x, h.y);
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
      LAYOUT.clouds.file,
      LAYOUT.water.file,
      LAYOUT.shadow.file,
      ...LAYOUT.props.map((p) => p.file),
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

    cloudMesh = makePlane(texMap[LAYOUT.clouds.file], LAYOUT.clouds, z++);
    // Overscan so slow parallax drift never reveals the plane edges against the sky.
    cloudMesh.scale.x = 1.3;
    cloudMesh.scale.y = 1.08;
    cloudMesh.userData.baseX = cloudMesh.position.x;
    cloudMesh.userData.basePosY = cloudMesh.position.y;
    artRoot.add(cloudMesh);

    waterMat = makeWaterMaterial(texMap[LAYOUT.water.file]);
    artRoot.add(makePlane(texMap[LAYOUT.water.file], LAYOUT.water, z++, waterMat));

    // Framing layers: pivot from an outer corner so grow bleeds into the scene.
    // sx/sy: -1 left/bottom, +1 right/top. Negative margin pulls the pivot on-screen.
    const FRAME_ANCHORS = {
      palmL: { sx: -1, sy: 1, grow: 1.1, margin: 0.05 },
      palmR2: { sx: 1, sy: 1, grow: 1.1, margin: 0.05 },
      palmR1: { sx: 1, sy: 1, grow: 1.12, margin: 0.06 },
      // Slight overscan so the hard-cropped leaf edge stays off-screen while leaves sway.
      overlayL: { sx: -1, sy: -1, grow: 1.12, margin: 0.035 },
      overlayR: { sx: 1, sy: -1, grow: 1.12, margin: 0.035 },
    };

    function applyFrameAnchor(mesh, p, anchor) {
      const loc = pxToLocal(p.x, p.y, p.w, p.h);
      const hw = loc.w / 2;
      const hh = loc.h / 2;
      mesh.geometry.translate(-anchor.sx * hw, -anchor.sy * hh, 0);
      mesh.position.set(
        loc.x + anchor.sx * hw + anchor.sx * anchor.margin,
        loc.y + anchor.sy * hh + anchor.sy * anchor.margin,
        mesh.position.z
      );
      mesh.scale.set(anchor.grow, anchor.grow, 1);
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
      }
      const mesh = makePlane(texMap[p.file], p, z++, mat);
      mesh.userData.id = p.id;

      const anchor = FRAME_ANCHORS[p.id];
      if (anchor) applyFrameAnchor(mesh, p, anchor);

      mesh.userData.basePos = mesh.position.clone();
      artRoot.add(mesh);
      propMeshes[p.id] = mesh;
      if (p.id === 'ship') shipMesh = mesh;
      if (p.id === 'mountain') mountainMesh = mesh;
      if (p.id.startsWith('palm')) palmMeshes.push(mesh);
    });

    // Shore waves sit in front of their landmasses at the waterline.
    if (propMeshes.wake && shipMesh) {
      propMeshes.wake.position.z = shipMesh.position.z + 0.5;
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
    if (propMeshes.mountainWaves && mountainMesh) {
      propMeshes.mountainWaves.position.z = mountainMesh.position.z + 0.4;
      propMeshes.mountainWaves.userData.basePos = propMeshes.mountainWaves.position.clone();
    }
    if (propMeshes.fortWaves && propMeshes.fort) {
      propMeshes.fortWaves.position.z = propMeshes.fort.position.z + 0.4;
      propMeshes.fortWaves.userData.basePos = propMeshes.fortWaves.position.clone();
    }

    // Soft waterline shadow grounds the ship without darkening its artwork.
    if (shipMesh) {
      const shadowLoc = pxToLocal(64, 496, 306, 56);
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
      artRoot.add(shipShadow);
    }

    artRoot.add(makePlane(texMap[LAYOUT.shadow.file], LAYOUT.shadow, z++));

    // Corner foliage in front of vignette (must stay below camera.z).
    // Leaf sway is vertex-warped (upper/outer only); rocks stay planted.
    LAYOUT.overlays.forEach((p, i) => {
      const side = p.id === 'overlayL' ? -1 : 1;
      const mat = makeOverlayFoliageMaterial(texMap[p.file], side);
      const loc = pxToLocal(p.x, p.y, p.w, p.h);
      const anchor = FRAME_ANCHORS[p.id];
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
          loc.x + anchor.sx * hw + anchor.sx * anchor.margin,
          loc.y + anchor.sy * hh + anchor.sy * anchor.margin,
          mesh.position.z
        );
        mesh.scale.set(anchor.grow, anchor.grow, 1);
        mesh.userData.anchored = true;
      }
      mesh.userData.basePos = mesh.position.clone();
      mesh.userData.foliageMat = mat;
      artRoot.add(mesh);
      propMeshes[p.id] = mesh;
    });

    // Arc droplets: leave the bottom of waterfall-01 and land on waterfall-02.
    if (propMeshes.waterfall && propMeshes.waterfallSpray) {
      const wf = propMeshes.waterfall;
      const spray = propMeshes.waterfallSpray;
      const frontZ = (propMeshes.mountainWaves
        ? propMeshes.mountainWaves.position.z
        : spray.position.z) + 0.5;
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

    // Seagulls
    const birdTex = makeSeagullTex();
    const birdPaths = [
      { cx: -0.45, cy: 0.42, rx: 0.16, ry: 0.07, speed: 0.32, phase: 0 },
      { cx: 0.35, cy: 0.48, rx: 0.2, ry: 0.08, speed: 0.26, phase: 1.2 },
      { cx: 0.1, cy: 0.55, rx: 0.22, ry: 0.05, speed: 0.2, phase: 2.4 },
      { cx: -0.2, cy: 0.5, rx: 0.18, ry: 0.06, speed: 0.28, phase: 0.7 },
    ];
    birdPaths.forEach((path) => {
      const mat = new THREE.MeshBasicMaterial({
        map: birdTex,
        transparent: true,
        depthWrite: false,
      });
      const bird = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.03), mat);
      bird.userData.path = path;
      // Behind everything except the sky/clouds backdrop (bg z=-5, clouds z=-4).
      bird.position.z = -3.9;
      artRoot.add(bird);
      seagulls.push(bird);
    });

    resize();
    positionHotspots();
    updateRoute();

    // While the stage width animates for the side panel, skip WebGL setSize —
    // resizing the drawing buffer every frame clears the canvas and looks like a fade.
    let layoutAnimating = false;
    const syncLayout = () => {
      resize();
      positionHotspots();
      updateRoute();
    };
    const syncHotspotsOnly = () => {
      positionHotspots();
      updateRoute();
    };

    stage.addEventListener('transitionrun', (e) => {
      if (e.propertyName === 'width') layoutAnimating = true;
    });
    stage.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'width') return;
      layoutAnimating = false;
      syncLayout();
    });
    stage.addEventListener('transitioncancel', (e) => {
      if (e.propertyName !== 'width') return;
      layoutAnimating = false;
      syncLayout();
    });

    window.addEventListener('resize', () => {
      if (layoutAnimating) {
        syncHotspotsOnly();
        return;
      }
      syncLayout();
    });
    if ('ResizeObserver' in window) {
      const stageObserver = new ResizeObserver(() => {
        if (layoutAnimating) {
          syncHotspotsOnly();
          return;
        }
        syncLayout();
      });
      stageObserver.observe(stage);
    }

    let lastRipple = 0;
    stage.addEventListener('pointermove', (e) => {
      const art = screenToArt(e.clientX, e.clientY);
      if (art.x < 0 || art.y < 0 || art.x > ART_W || art.y > ART_H) return;
      // Water layer local UV
      const wy = LAYOUT.water.y;
      const wh = LAYOUT.water.h;
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
      const wy = LAYOUT.water.y;
      const wh = LAYOUT.water.h;
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
      if (cloudMesh) {
        // Slow, continuous parallax drift within the overscan margin (no visible edge).
        cloudMesh.position.x = cloudMesh.userData.baseX + Math.sin(t * 0.045) * 0.09;
        cloudMesh.position.y =
          cloudMesh.userData.basePosY !== undefined
            ? cloudMesh.userData.basePosY
            : cloudMesh.position.y;
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
          shipShadow.scale.x = 1 - lift * 0.06;
          shipShadow.material.opacity = 0.5 - lift * 0.12;
        }
        // Wake sits right under the hull, drifting just slightly with the ship.
        if (propMeshes.wake) {
          const wb = propMeshes.wake.userData.basePos;
          propMeshes.wake.position.x = wb.x + surge * 0.002;
          propMeshes.wake.position.y = wb.y + heave * 0.0015;
          if (wakeMat) wakeMat.userData.uSwell.value = heave;
        }
      }
      for (let i = 0; i < waveMats.length; i++) {
        waveMats[i].userData.uTime.value = t;
      }
      for (let i = 0; i < waterfallMats.length; i++) {
        waterfallMats[i].userData.uTime.value = t;
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
        bird.scale.x = Math.cos(a) >= 0 ? 1 : -1;
        bird.scale.y = 1 + Math.sin(t * 9 + p.phase) * 0.12;
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
