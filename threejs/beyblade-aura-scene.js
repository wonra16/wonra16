// =============================================================================
// GYRION - BEY AURA VFX (Three.js Playground prototipi, sadece 'three' core)
// Referans: "vortex aura" (kase seklinde donen enerji girdabi + yer dalgalari
// + diken sicramalari + kivilcimlar). Her topacin KENDINE OZGU aurasi var:
//   KOR    / Crimson Rift   -> kizil alev girdabi, hizli, cok diken
//   ATLAS  / Domed Guardian -> altin girdap + altigen kalkan kubbesi
//   SEREIN / Silent Orbit   -> sakin mavi girdap + yorunge halkalari
//   VEKTOR / Broken Prism   -> mor/prizma girdap + yorungede kirik kristaller
//
// Unity'ye ayni matematikle tasindi: unity/GyrionBeyAura/
// SADECE AURA (topac modeli yok). Kontroller: auraya tikla = patlama (skill),
// surukle = kamera, "Shift colour" = secili auranin rengini degistir.
// =============================================================================

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Aura tanimlari (Unity'deki BeyAuraPreset ile birebir ayni degerler)
// ---------------------------------------------------------------------------
const FAMILIES = {
  KOR: {
    label: 'KOR / Crimson Rift',
    colA: [1.0, 0.07, 0.015], colB: [1.0, 0.5, 0.18],
    swirlSpeed: 0.75, twist: 2.6, streaks: 7, flame: 1.6, rimSpeed: 2.6,
    spikes: 30, spikeAmt: 1.0, rings: 5, sparkRise: 1.6, sparkCount: 170, extra: 'flame',
  },
  ATLAS: {
    label: 'ATLAS / Domed Guardian',
    colA: [1.0, 0.62, 0.0], colB: [1.0, 0.95, 0.55],
    swirlSpeed: 0.35, twist: 1.6, streaks: 5, flame: 0.4, rimSpeed: 0.9,
    spikes: 20, spikeAmt: 0.55, rings: 4, sparkRise: 0.55, sparkCount: 120, extra: 'dome',
  },
  SEREIN: {
    label: 'SEREIN / Silent Orbit',
    colA: [0.02, 0.35, 1.0], colB: [0.55, 0.95, 1.0],
    swirlSpeed: 0.28, twist: 1.2, streaks: 4, flame: 0.25, rimSpeed: 0.7,
    spikes: 16, spikeAmt: 0.35, rings: 7, sparkRise: 0.35, sparkCount: 130, extra: 'orbit',
  },
  VEKTOR: {
    label: 'VEKTOR / Broken Prism',
    colA: [0.75, 0.05, 1.0], colB: [1.0, 0.6, 1.0],
    swirlSpeed: 0.55, twist: 2.0, streaks: 6, flame: 0.8, rimSpeed: 1.6,
    spikes: 26, spikeAmt: 0.85, rings: 5, sparkRise: 0.9, sparkCount: 140, extra: 'prism',
  },
};
// "Shift colour" icin ozel renkler (referanstaki "This Can Custom Color")
const CUSTOM_COLORS = [
  { name: 'Emerald', colA: [0.05, 1.0, 0.12], colB: [0.75, 1.0, 0.5] },
  { name: 'White', colA: [0.75, 0.78, 0.85], colB: [1.0, 1.0, 1.0] },
  { name: 'Azure', colA: [0.02, 0.35, 1.0], colB: [0.55, 0.95, 1.0] },
  { name: 'Ember', colA: [1.0, 0.07, 0.015], colB: [1.0, 0.5, 0.18] },
  { name: 'Gold', colA: [1.0, 0.62, 0.0], colB: [1.0, 0.95, 0.55] },
  { name: 'Violet', colA: [0.75, 0.05, 1.0], colB: [1.0, 0.6, 1.0] },
];

// ---------------------------------------------------------------------------
// Ortak GLSL (periyodik noise -> kasenin dikis yerinde iz olmaz)
// ---------------------------------------------------------------------------
const GLSL_COMMON = /* glsl */ `
  #define TAU 6.28318530718
  float sq(float x){ return x * x; }
  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoiseP(vec2 p, float per){
    vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    float i0 = mod(i.x, per), i1 = mod(i.x + 1.0, per);
    return mix(mix(hash12(vec2(i0, i.y)), hash12(vec2(i1, i.y)), u.x),
               mix(hash12(vec2(i0, i.y + 1.0)), hash12(vec2(i1, i.y + 1.0)), u.x), u.y);
  }
  float fbmP(vec2 p, float per){
    float s = 0.0, a = 0.5;
    for (int k = 0; k < 4; k++){ s += a * vnoiseP(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
    return s;
  }
`;

const AURA_VS = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
  void main(){
    vUv = uv; vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

// Kase / girdap (bowl + ic koni ayni shader)
const BOWL_FS = /* glsl */ `
  uniform float uTime, uSpeed, uTwist, uStreaks, uFlame, uRimSpeed, uIntensity, uRim, uBottomFade, uTopFade, uDensity;
  uniform vec3 uColA, uColB;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  ${GLSL_COMMON}
  void main(){
    float a = vUv.x, t = vUv.y;
    float per = uStreaks;
    // donen spiral koordinat
    vec2 sp = vec2(a * per + t * uTwist - uTime * uSpeed * per * 0.25, t * 2.5 - uTime * uFlame);
    float n = fbmP(sp, per);
    float n2 = fbmP(sp * vec2(2.0, 1.4) + vec2(0.0, 7.3), per * 2.0);
    float streak = smoothstep(0.5 - uDensity, 0.86, n) * (0.55 + 0.9 * n2);
    float wisps = smoothstep(0.62, 0.95, n2) * 0.8;
    // ust kenar: kalin parlak halka, bir tarafi daha parlak (donen hilal)
    float rimBand = exp(-sq((t - 0.955) / 0.035)) + 0.35 * exp(-sq((t - 0.86) / 0.03));
    float cres = 0.3 + 0.7 * pow(0.5 + 0.5 * cos(TAU * a - uTime * uRimSpeed), 2.0);
    float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float fade = smoothstep(0.0, uBottomFade, t) * (1.0 - smoothstep(1.0 - uTopFade, 1.0, t));
    vec3 col = uColA * (streak * 1.7 + wisps * 0.8 + 0.06) * (0.55 + fres * 1.1) * fade;
    col += mix(uColA, uColB, 0.15 + 0.35 * cres * cres) * rimBand * cres * uRim * (0.6 + 0.8 * n);
    col += uColB * pow(streak, 3.0) * 0.3 * fade;
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }`;

// Yerdeki spiral dalgalar + diken sicramasi + patlama sok dalgasi
const FLOOR_FS = /* glsl */ `
  uniform float uTime, uSpeed, uRings, uSpikes, uSpikeAmt, uIntensity, uBurst, uInner;
  uniform vec3 uColA, uColB;
  varying vec3 vLocal;
  ${GLSL_COMMON}
  void main(){
    vec2 p = vLocal.xy;               // disk yaricapi 1'e normalize
    float r = length(p);
    float ang = atan(p.y, p.x) / TAU + 0.5;
    // spiral halkalar (kesik kesik)
    float f = r * uRings + ang * 2.0 - uTime * uSpeed * 1.4;
    float band = pow(0.5 + 0.5 * cos(TAU * f), 10.0);
    float brk = smoothstep(0.35, 0.75, fbmP(vec2(ang * 12.0 + uTime * uSpeed * 3.0, r * 3.0 - uTime * 0.6), 12.0));
    float rings = band * brk * smoothstep(0.08, 0.3, r) * (1.0 - smoothstep(0.55, 0.95, r));
    // dikenler (radyal kristal sicramalari)
    float N = uSpikes;
    float cell = floor(ang * N);
    float c = fract(ang * N);
    float tick = floor(uTime * 3.0 + hash12(vec2(cell, 3.1)) * 7.0);
    float h = hash12(vec2(cell, tick));
    float on = step(1.0 - uSpikeAmt * 0.7, h);
    float r0 = uInner;
    float L = r0 + 0.07 + 0.22 * hash12(vec2(cell, tick + 9.0));
    float k = clamp((r - r0) / (L - r0), 0.0, 1.0);
    float bend = (hash12(vec2(cell, 5.0)) - 0.5) * 0.5 * k;           // hafif egik dil
    float w = (1.0 - k) * 0.3 + 0.02;
    float spike = on * smoothstep(w, 0.0, abs(c - 0.5 - bend)) * smoothstep(r0 - 0.03, r0 + 0.02, r) * (1.0 - smoothstep(L - 0.06, L, r));
    spike *= (1.0 - k * 0.7) * (0.45 + 0.55 * vnoiseP(vec2(cell * 3.0 + r * 30.0, uTime * 6.0), 1000.0));
    // merkez parlamasi + kenar sonmesi
    float glow = exp(-r * r * 14.0) * 0.55 + exp(-r * r * 3.0) * 0.12;
    float edge = 1.0 - smoothstep(0.75, 1.0, r);
    // patlama sok dalgasi
    float shock = exp(-sq((r - uBurst * 0.95) / 0.035)) * (1.0 - uBurst) * step(0.001, uBurst) * 3.0;
    vec3 col = uColA * (rings * 1.4 + glow + spike * 0.9) * edge + uColB * (spike * 0.15 + shock);
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }`;

// ATLAS kalkan kubbesi: altigen grid + fresnel + yukari kayan tarama bandi
const DOME_FS = /* glsl */ `
  uniform float uTime, uIntensity; uniform vec3 uColA, uColB;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vLocal;
  float sq(float x){ return x * x; }
  float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
  void main(){
    vec2 uv = vec2(vUv.x * 28.0, vUv.y * 9.0);
    vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(uv, s) - s * 0.5, b = mod(uv - s * 0.5, s) - s * 0.5;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    float edge = smoothstep(0.42, 0.5, hexDist(g));
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
    float y = vLocal.y;
    float scan = exp(-sq((y - fract(uTime * 0.35) * 1.1) / 0.05));
    float base = smoothstep(0.0, 0.15, y);
    vec3 col = uColA * (edge * (0.12 + fres * 0.9) + fres * 0.35) + uColB * scan * (0.25 + edge * 1.2);
    gl_FragColor = vec4(col * base * uIntensity, 1.0);
  }`;

// Ince halkalar (ust hale halkasi, SEREIN yorungeleri)
const RING_FS = /* glsl */ `
  uniform float uTime, uIntensity, uSpeed, uDash; uniform vec3 uColA, uColB;
  varying vec2 vUv;
  ${GLSL_COMMON}
  void main(){
    float a = vUv.x;
    float cres = 0.25 + 0.75 * pow(0.5 + 0.5 * cos(TAU * a - uTime * uSpeed), 3.0);
    float dash = mix(1.0, smoothstep(0.3, 0.7, vnoiseP(vec2(a * 24.0 - uTime * uSpeed * 2.0, 0.5), 24.0)), uDash);
    vec3 col = mix(uColA, uColB, cres * 0.6) * cres * dash;
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }`;

export function createCrystalScene(canvas) {
  const CFG = { exposure: 1.0, bloomStrength: 0.95, bloomThreshold: 0.9, bloomKnee: 0.5 };
  // Sadece auralar gosterilir. Ornek topac modelini gormek istersen true yap.
  const SHOW_PLACEHOLDER_TOPS = false;

  const size = () => ({
    w: Math.max(1, Math.floor(canvas.clientWidth || window.innerWidth)),
    h: Math.max(1, Math.floor(canvas.clientHeight || window.innerHeight)),
  });
  let { w: width, h: height } = size();

  // ---------------------------------------------------------------------------
  // Renderer / sahne / kamera
  // ---------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CFG.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0x111113);
  scene.background = FOG.clone();
  scene.fog = new THREE.Fog(FOG.clone(), 9, 24);

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 200);

  const disposables = [];
  const track = (o) => (disposables.push(o), o);
  const vec3c = (rgb, k = 1) => new THREE.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k);

  // Metal yansimalari icin basit studio environment
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 d; void main(){ gl_FragColor = vec4(mix(vec3(0.03), vec3(0.35,0.37,0.42), smoothstep(-0.2,0.8,d.y)), 1.); }',
    })));
    const panel = (w, h, c, p) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.copy(p); m.lookAt(0, 0, 0); env.add(m); };
    panel(8, 3, new THREE.Color(3, 3, 3.2), new THREE.Vector3(0, 8, 1));
    panel(3, 4, new THREE.Color(1.4, 1.4, 1.5), new THREE.Vector3(8, 2, 3));
    panel(3, 4, new THREE.Color(0.8, 0.8, 0.9), new THREE.Vector3(-8, 2, -3));
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = track(pm.fromScene(env, 0.03));
    scene.environment = rt.texture;
    pm.dispose();
    env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }

  scene.add(new THREE.HemisphereLight(0x9aa0b0, 0x101012, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-4, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // ---------------------------------------------------------------------------
  // Dama zemin
  // ---------------------------------------------------------------------------
  {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#4a4a4c'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#353537'; g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
    const tex = track(new THREE.CanvasTexture(c));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.magFilter = THREE.NearestFilter;
    const S = 120;
    tex.repeat.set(S / 1.0, S / 1.0); // hucre = 0.5 m
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(S, S)), track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.0 })));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
  }

  // ---------------------------------------------------------------------------
  // Topac modeli (oyundaki modelin yerine gecici prosedurel topac)
  // ---------------------------------------------------------------------------
  const metal = track(new THREE.MeshStandardMaterial({ color: 0xb8bcc6, metalness: 1.0, roughness: 0.22 }));
  const darkMetal = track(new THREE.MeshStandardMaterial({ color: 0x2a2c32, metalness: 0.9, roughness: 0.35 }));
  const bodyGeo = track(new THREE.LatheGeometry(
    [[0, 0], [0.025, 0.0], [0.04, 0.04], [0.07, 0.08], [0.12, 0.095], [0.24, 0.11], [0.36, 0.13], [0.38, 0.165], [0.34, 0.2], [0.2, 0.215], [0.12, 0.25], [0.1, 0.28], [0, 0.29]]
      .map(([x, y]) => new THREE.Vector2(x, y)), 64,
  ));
  const bladeGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0.18, -0.05); s.lineTo(0.44, -0.02); s.quadraticCurveTo(0.47, 0.06, 0.4, 0.12); s.lineTo(0.2, 0.06); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.14, 0);
    return track(g);
  })();
  const chipGeo = track(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 32));
  const ringGeo = track(new THREE.TorusGeometry(0.3, 0.016, 8, 64).rotateX(Math.PI / 2));

  function makeTop(colA) {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const body = new THREE.Mesh(bodyGeo, metal);
    body.castShadow = true;
    spin.add(body);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(bladeGeo, i % 2 ? metal : darkMetal);
      b.rotation.y = (i / 4) * Math.PI * 2;
      b.castShadow = true;
      spin.add(b);
    }
    const chipMat = track(new THREE.MeshStandardMaterial({ color: 0x050505, emissive: vec3c(colA), emissiveIntensity: 4 }));
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.y = 0.295;
    spin.add(chip);
    const ringMat = track(new THREE.MeshStandardMaterial({ color: 0x050505, emissive: vec3c(colA), emissiveIntensity: 2.5 }));
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.18;
    spin.add(ring);
    return { group: g, spin, chipMat, ringMat };
  }

  // ---------------------------------------------------------------------------
  // AURA - her topac icin bir tane
  // ---------------------------------------------------------------------------
  const bowlProfile = (r0, r1, h, n = 40) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(t, 0.62), h * t));
    }
    return pts;
  };
  const BOWL_GEO = track(new THREE.LatheGeometry(bowlProfile(0.2, 1.35, 0.82), 128));
  const INNER_GEO = track(new THREE.LatheGeometry(bowlProfile(0.12, 0.62, 0.95), 96));
  const FLOOR_GEO = track(new THREE.CircleGeometry(1, 96));
  const HALO_GEO = track(new THREE.TorusGeometry(1.37, 0.016, 8, 160).rotateX(Math.PI / 2));
  const DOME_GEO = track(new THREE.SphereGeometry(1.05, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2));
  const ORBIT_GEO = track(new THREE.TorusGeometry(1, 0.006, 6, 160).rotateX(Math.PI / 2));
  const SHARD_GEO = track(new THREE.OctahedronGeometry(0.07, 0).scale(0.6, 1.6, 0.6));

  const softPointMat = () => track(new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vC;
      void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uScale / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q);
        float a = smoothstep(0.5, 0.0, d); float core = smoothstep(0.12, 0.0, d);
        float star = smoothstep(0.06, 0.0, min(abs(q.x), abs(q.y))) * smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vC * (a * a * 0.5 + core * 1.6 + star * 0.8), 1.0); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  }));
  const pointMats = [];

  function additive(fs, uniforms, side = THREE.DoubleSide) {
    return track(new THREE.ShaderMaterial({
      uniforms, vertexShader: AURA_VS, fragmentShader: fs,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side, fog: false,
    }));
  }

  function createAura(family) {
    const F = FAMILIES[family];
    const root = new THREE.Group();
    const colA = vec3c(F.colA), colB = vec3c(F.colB);
    const shared = { uTime: { value: 0 }, uColA: { value: colA }, uColB: { value: colB }, uIntensity: { value: 1 } };

    const bowlMat = additive(BOWL_FS, {
      ...shared, uSpeed: { value: F.swirlSpeed }, uTwist: { value: F.twist }, uStreaks: { value: F.streaks },
      uFlame: { value: F.flame }, uRimSpeed: { value: F.rimSpeed }, uRim: { value: 1.8 },
      uBottomFade: { value: 0.3 }, uTopFade: { value: 0.0 }, uDensity: { value: 0.07 },
    });
    const bowl = new THREE.Mesh(BOWL_GEO, bowlMat);
    root.add(bowl);

    const innerMat = additive(BOWL_FS, {
      ...shared, uSpeed: { value: F.swirlSpeed * 2.2 }, uTwist: { value: F.twist * 1.8 }, uStreaks: { value: Math.max(3, F.streaks - 2) },
      uFlame: { value: F.flame * 1.5 }, uRimSpeed: { value: F.rimSpeed }, uRim: { value: 0.0 },
      uBottomFade: { value: 0.15 }, uTopFade: { value: 0.55 }, uDensity: { value: -0.08 },
    });
    const inner = new THREE.Mesh(INNER_GEO, innerMat);
    root.add(inner);

    const floorMat = additive(FLOOR_FS, {
      ...shared, uSpeed: { value: F.swirlSpeed }, uRings: { value: F.rings }, uSpikes: { value: F.spikes },
      uSpikeAmt: { value: F.spikeAmt }, uBurst: { value: 0 }, uInner: { value: 0.5 },
    });
    floorMat.polygonOffset = true; floorMat.polygonOffsetFactor = -2;
    const floor = new THREE.Mesh(FLOOR_GEO, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.004;
    floor.scale.setScalar(2.3);
    root.add(floor);

    const haloMat = additive(RING_FS, { ...shared, uSpeed: { value: F.rimSpeed * 1.3 }, uDash: { value: 0.35 } });
    const halo = new THREE.Mesh(HALO_GEO, haloMat);
    halo.position.y = 0.8;
    root.add(halo);

    const extras = [];
    // --- aileye ozel parcalar
    if (F.extra === 'dome') {
      const dm = additive(DOME_FS, { ...shared }, THREE.FrontSide);
      const dome = new THREE.Mesh(DOME_GEO, dm);
      root.add(dome);
      extras.push({ mesh: dome, update: (t) => { dome.rotation.y = t * 0.15; } });
    }
    if (F.extra === 'orbit') {
      for (let i = 0; i < 3; i++) {
        const om = additive(RING_FS, { ...shared, uSpeed: { value: 1.2 + i * 0.5 }, uDash: { value: 0.6 } });
        const ring = new THREE.Mesh(ORBIT_GEO, om);
        const s = 0.75 + i * 0.22;
        ring.scale.setScalar(s);
        const tilt = 0.35 + i * 0.25, phase = i * 2.1;
        root.add(ring);
        extras.push({ mesh: ring, update: (t) => {
          ring.position.y = 0.35 + i * 0.08;
          ring.rotation.set(Math.sin(t * 0.4 + phase) * tilt, t * (0.6 + i * 0.3), Math.cos(t * 0.4 + phase) * tilt);
        } });
      }
    }
    if (F.extra === 'prism') {
      for (let i = 0; i < 12; i++) {
        const hue = 0.72 + (i / 12) * 0.35;
        const c = new THREE.Color().setHSL(hue % 1, 1, 0.55);
        const mat = track(new THREE.MeshBasicMaterial({ color: c.multiplyScalar(2.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
        const shard = new THREE.Mesh(SHARD_GEO, mat);
        const rad = 0.55 + Math.random() * 0.75, h = 0.15 + Math.random() * 0.6, sp = 0.5 + Math.random() * 0.9, ph = Math.random() * 6.28;
        shard.scale.setScalar(0.6 + Math.random() * 0.9);
        root.add(shard);
        extras.push({ mesh: shard, update: (t) => {
          const a = ph + t * sp;
          shard.position.set(Math.cos(a) * rad, h + Math.sin(t * 2 + ph) * 0.06, Math.sin(a) * rad);
          shard.rotation.set(t * 1.7 + ph, t * 2.3, ph);
        } });
      }
    }

    // --- kivilcimlar (girdapla donerek yukselir)
    const N = F.sparkCount;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), sz = new Float32Array(N);
    const st = Array.from({ length: N }, () => ({}));
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage));
    const pm = softPointMat();
    pointMats.push(pm);
    const points = new THREE.Points(geo, pm);
    points.frustumCulled = false;
    root.add(points);
    const spawn = (s, warm) => {
      s.a = Math.random() * Math.PI * 2;
      s.r = 0.2 + Math.pow(Math.random(), 0.7) * 1.35;
      s.y = Math.random() * 0.15;
      s.vy = F.sparkRise * (0.3 + Math.random() * 0.9);
      s.w = (0.6 + Math.random()) * F.swirlSpeed * 2.4 / Math.max(0.35, s.r);
      s.max = 0.5 + Math.random() * 1.6;
      s.life = warm ? Math.random() * s.max : s.max;
      s.size = (0.012 + Math.random() * 0.028) * (Math.random() < 0.1 ? 2 : 1);
      s.hot = Math.random();
    };
    st.forEach((s) => spawn(s, true));

    const light = new THREE.PointLight(colA.clone(), 5, 4.5, 2);
    light.position.y = 0.35;
    root.add(light);

    const aura = {
      family, root, mats: [bowlMat, innerMat, floorMat, haloMat, ...extras.map((e) => e.mesh.material).filter((m) => m.uniforms)],
      colA, colB, light, burst: 0, power: 1,
      update(t, dt) {
        const boost = 1 + 1.6 * Math.max(0, 1 - this.burst * 1.4) * (this.burst > 0 ? 1 : 0);
        const breathe = 0.92 + 0.08 * Math.sin(t * 2.2 + root.position.x);
        const I = this.power * breathe * boost;
        for (const m of this.mats) { m.uniforms.uTime.value = t; m.uniforms.uIntensity.value = I; }
        floorMat.uniforms.uBurst.value = this.burst;
        if (this.burst > 0) { this.burst += dt * 1.1; if (this.burst >= 1) this.burst = 0; }
        halo.rotation.set(Math.sin(t * 0.9) * 0.06, 0, Math.cos(t * 0.7) * 0.06);
        light.intensity = 5 * I;
        extras.forEach((e) => e.update(t));
        // kivilcimlar
        for (let i = 0; i < N; i++) {
          const s = st[i];
          s.life -= dt;
          if (s.life <= 0) spawn(s, false);
          s.a += s.w * dt;
          s.y += s.vy * dt;
          s.r += (F.extra === 'flame' ? -0.15 : 0.05) * dt;
          const lf = s.life / s.max, fade = Math.sin(lf * Math.PI);
          const tw = 0.55 + 0.45 * Math.sin(t * 25 + i * 1.7);
          pos[i * 3] = Math.cos(s.a) * s.r; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = Math.sin(s.a) * s.r;
          const k = 3.2 * fade * tw * I;
          const m = s.hot;
          col[i * 3] = (this.colA.r * (1 - m) + this.colB.r * m) * k;
          col[i * 3 + 1] = (this.colA.g * (1 - m) + this.colB.g * m) * k;
          col[i * 3 + 2] = (this.colA.b * (1 - m) + this.colB.b * m) * k;
          sz[i] = s.size * (0.4 + 0.6 * fade);
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aColor.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
      },
      setColors(a, b) {
        this.colA.setRGB(...a); this.colB.setRGB(...b);
        light.color.setRGB(...a);
      },
    };
    return aura;
  }

  // ---------------------------------------------------------------------------
  // 4 topac + auralari
  // ---------------------------------------------------------------------------
  const LAYOUT = [
    ['SEREIN', -1.95, -1.75], ['KOR', 1.95, -1.75],
    ['ATLAS', -1.95, 1.75], ['VEKTOR', 1.95, 1.75],
  ];
  const beys = LAYOUT.map(([fam, x, z], idx) => {
    const aura = createAura(fam);
    aura.root.position.set(x, 0, z);
    scene.add(aura.root);
    const top = makeTop(FAMILIES[fam].colA);
    top.group.position.set(x, 0, z);
    top.group.scale.setScalar(1.3);
    if (SHOW_PLACEHOLDER_TOPS) scene.add(top.group);
    // tiklama icin gorunmez hacim
    const hit = new THREE.Mesh(track(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 12)), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x, 0.6, z);
    hit.userData.index = idx;
    scene.add(hit);
    return { fam, aura, top, hit, base: new THREE.Vector3(x, 0, z), phase: idx * 1.7, customIdx: -1 };
  });

  // ---------------------------------------------------------------------------
  // Bloom (HDR -> parlaklik filtresi -> 5 kademe blur -> ACES)
  // ---------------------------------------------------------------------------
  const MIPS = 5;
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false };
  const rtScene = track(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const rtBright = track(new THREE.WebGLRenderTarget(1, 1, rtOpts));
  const rtH = [], rtV = [], mipSize = [];
  for (let i = 0; i < MIPS; i++) { rtH.push(track(new THREE.WebGLRenderTarget(1, 1, rtOpts))); rtV.push(track(new THREE.WebGLRenderTarget(1, 1, rtOpts))); }
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsGeo = track(new THREE.BufferGeometry());
  fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  const fsQuad = new THREE.Mesh(fsGeo);
  fsQuad.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(fsQuad);
  const FS_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const blit = (mat, target) => { fsQuad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };
  const brightMat = track(new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uThreshold: { value: CFG.bloomThreshold }, uKnee: { value: CFG.bloomKnee } },
    vertexShader: FS_VS,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uThreshold, uKnee; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
        gl_FragColor = vec4(min(c * max(soft, br - uThreshold) / max(br, 1e-4), vec3(60.0)), 1.0); }`,
    depthTest: false, depthWrite: false,
  }));
  const KERNEL = 7;
  const gaussW = (() => { const sg = KERNEL / 2.6, w = []; let sum = 0; for (let i = 0; i < KERNEL; i++) { w[i] = Math.exp(-(i * i) / (2 * sg * sg)); sum += i ? 2 * w[i] : w[i]; } return w.map((v) => v / sum); })();
  const blurMat = track(new THREE.ShaderMaterial({
    defines: { KERNEL },
    uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() }, uW: { value: gaussW } },
    vertexShader: FS_VS,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; uniform float uW[KERNEL]; varying vec2 vUv;
      void main(){ vec3 s = texture2D(tDiffuse, vUv).rgb * uW[0];
        for (int i = 1; i < KERNEL; i++){ vec2 o = uDir * float(i); s += (texture2D(tDiffuse, vUv + o).rgb + texture2D(tDiffuse, vUv - o).rgb) * uW[i]; }
        gl_FragColor = vec4(s, 1.0); }`,
    depthTest: false, depthWrite: false,
  }));
  const compositeMat = track(new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, tB4: { value: null }, uStrength: { value: CFG.bloomStrength }, uTime: { value: 0 } },
    vertexShader: FS_VS,
    fragmentShader: `uniform sampler2D tScene, tB0, tB1, tB2, tB3, tB4; uniform float uStrength, uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(tScene, vUv).rgb;
        vec3 b = texture2D(tB0, vUv).rgb + texture2D(tB1, vUv).rgb * 0.9 + texture2D(tB2, vUv).rgb * 0.7 + texture2D(tB3, vUv).rgb * 0.45 + texture2D(tB4, vUv).rgb * 0.3;
        c += b * uStrength * 0.3;
        vec2 dc = vUv - 0.5; c *= mix(1.0, smoothstep(1.0, 0.3, length(dc) * 1.1), 0.45);
        gl_FragColor = vec4(max(c, 0.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += (h(vUv * 1000.0 + fract(uTime)) - 0.5) / 255.0;
      }`,
    depthTest: false, depthWrite: false,
  }));
  function resizeTargets() {
    const W = Math.max(1, Math.floor(width * dpr)), H = Math.max(1, Math.floor(height * dpr));
    rtScene.setSize(W, H);
    let w = Math.max(1, W >> 1), h = Math.max(1, H >> 1);
    rtBright.setSize(w, h);
    for (let i = 0; i < MIPS; i++) { rtH[i].setSize(w, h); rtV[i].setSize(w, h); mipSize[i] = [w, h]; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }
    const s = H * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    pointMats.forEach((m) => (m.uniforms.uScale.value = s));
  }
  function renderFrame() {
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);
    brightMat.uniforms.tDiffuse.value = rtScene.texture;
    blit(brightMat, rtBright);
    let src = rtBright.texture;
    for (let i = 0; i < MIPS; i++) {
      const [w, h] = mipSize[i];
      blurMat.uniforms.tDiffuse.value = src; blurMat.uniforms.uDir.value.set(1 / w, 0); blit(blurMat, rtH[i]);
      blurMat.uniforms.tDiffuse.value = rtH[i].texture; blurMat.uniforms.uDir.value.set(0, 1 / h); blit(blurMat, rtV[i]);
      src = rtV[i].texture;
    }
    const u = compositeMat.uniforms;
    u.tScene.value = rtScene.texture;
    [u.tB0, u.tB1, u.tB2, u.tB3, u.tB4].forEach((x, i) => (x.value = rtV[i].texture));
    blit(compositeMat, null);
  }

  // ---------------------------------------------------------------------------
  // Kamera + etkilesim
  // ---------------------------------------------------------------------------
  const target = new THREE.Vector3(0, 0.15, 0.25);
  const orbit = { theta: 0, phi: 0.95, radius: 9.8 };
  const goal = { ...orbit };
  const pointer = new THREE.Vector2();
  let dragging = false, moved = 0, lastX = 0, lastY = 0;
  const onDown = (e) => { dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; };
  const onMove = (e) => {
    if (!dragging) return;
    moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
    goal.theta -= (e.clientX - lastX) * 0.005;
    goal.phi = THREE.MathUtils.clamp(goal.phi - (e.clientY - lastY) * 0.004, 0.3, 1.4);
    lastX = e.clientX; lastY = e.clientY;
  };
  const onUp = () => { dragging = false; };
  const onWheel = (e) => { e.preventDefault(); goal.radius = THREE.MathUtils.clamp(goal.radius * Math.exp(e.deltaY * 0.001), 4, 18); };
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const raycaster = new THREE.Raycaster();
  let selected = -1;
  function selectAt(x, y) {
    if (moved > 6) return selected >= 0; // surukleme tiklama sayilmaz
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    const hit = raycaster.intersectObjects(beys.map((b) => b.hit))[0];
    if (!hit) { selected = -1; return false; }
    const i = hit.object.userData.index;
    selected = i;
    beys[i].aura.burst = 0.001; // skill patlamasi
    return true;
  }
  function shiftPalette() {
    const list = selected >= 0 ? [beys[selected]] : beys;
    let name = '';
    list.forEach((b) => {
      b.customIdx = (b.customIdx + 1) % (CUSTOM_COLORS.length + 1);
      const isOrig = b.customIdx === CUSTOM_COLORS.length;
      const F = FAMILIES[b.fam];
      const C = isOrig ? { name: F.label, colA: F.colA, colB: F.colB } : CUSTOM_COLORS[b.customIdx];
      if (isOrig) b.customIdx = -1;
      b.aura.setColors(C.colA, C.colB);
      b.top.chipMat.emissive.setRGB(...C.colA);
      b.top.ringMat.emissive.setRGB(...C.colA);
      name = selected >= 0 ? `${F.label.split(' /')[0]} -> ${C.name}` : 'shuffled';
    });
    return name;
  }

  // ---------------------------------------------------------------------------
  // Dongu
  // ---------------------------------------------------------------------------
  let time = 0, paused = false, disposed = false, rafId = 0, last = performance.now();
  function update(dt) {
    time += dt;
    compositeMat.uniforms.uTime.value = time;
    beys.forEach((b, i) => {
      // topac: hizli donus + hafif yalpalama ve kucuk daire cizme
      b.top.spin.rotation.y -= dt * 28;
      const w = time * 1.3 + b.phase;
      b.top.group.position.set(b.base.x + Math.cos(w) * 0.06, 0, b.base.z + Math.sin(w) * 0.06);
      b.top.group.rotation.set(Math.sin(w * 2.0) * 0.05, 0, Math.cos(w * 2.0) * 0.05);
      b.aura.root.position.set(b.top.group.position.x, 0, b.top.group.position.z);
      b.aura.power = selected === -1 || selected === i ? 1 : 0.55;
      b.aura.update(time, dt);
    });
  }
  function updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 5);
    orbit.theta += (goal.theta + pointer.x * 0.08 - orbit.theta) * k;
    orbit.phi += (goal.phi - pointer.y * 0.04 - orbit.phi) * k;
    orbit.radius += (goal.radius - orbit.radius) * k;
    camera.position.set(
      target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
      target.y + orbit.radius * Math.cos(orbit.phi),
      target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta),
    );
    camera.lookAt(target);
  }
  function loop() {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    if (!paused) update(dt);
    updateCamera(dt);
    renderFrame();
  }

  function resize() {
    const s = size();
    const nd = Math.min(window.devicePixelRatio || 1, 2);
    if (s.w === width && s.h === height && nd === dpr) return;
    width = s.w; height = s.h; dpr = nd;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    resizeTargets();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  window.addEventListener('resize', resize);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  resizeTargets();
  for (let i = 0; i < 30; i++) update(1 / 60);
  updateCamera(1);
  loop();

  // ---------------------------------------------------------------------------
  // Playground API (main.js + interaction.js bunlari cagiriyor)
  // ---------------------------------------------------------------------------
  function dispose() {
    disposed = true;
    cancelAnimationFrame(rafId);
    ro?.disconnect();
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('wheel', onWheel);
    disposables.forEach((d) => d.dispose?.());
    renderer.dispose();
  }
  return {
    scene, camera, renderer,
    setPointer: (x, y) => pointer.set(x, y),
    selectAt,
    shiftPalette,
    toggleMotion: () => (paused = !paused),
    burst: (i) => { if (beys[i]) beys[i].aura.burst = 0.001; },
    dispose,
  };
}
