// =============================================================================
// SCI-FI LASER BEAM - Three.js Playground sahnesi (sadece 'three' core paketi)
// Referans: neon pembe lazer, beyaz/koyu panelli silah, grid zemin + duvar,
// HDR render -> özel çok kademeli Bloom -> ACES tonemapping.
//
// Kullanim: compilebytes.com/tools/threejs -> src/scene.js icine yapistir.
// Kontroller: surukle = kamerayi dondur, tekerlek = zoom, cift tik = renk degistir
// =============================================================================

import * as THREE from 'three';

export function createCrystalScene(canvas) {
  // ---------------------------------------------------------------------------
  // 0. Ayarlar
  // ---------------------------------------------------------------------------
  const CFG = {
    exposure: 1.05,
    bloomStrength: 0.8,
    bloomThreshold: 1.0,
    bloomKnee: 0.45,
    sparkCount: 520,
    emberCount: 320,
    cellSize: 0.5, // grid hucre boyu (metre)
  };

  const PALETTES = [
    { name: 'Magenta', core: [1.0, 0.72, 1.0], glow: [1.0, 0.06, 0.85], spark: [1.0, 0.35, 0.95], accent: [1.0, 0.12, 0.05] },
    { name: 'Cyan', core: [0.75, 1.0, 1.0], glow: [0.0, 0.55, 1.0], spark: [0.4, 0.9, 1.0], accent: [0.0, 0.9, 0.6] },
    { name: 'Plasma', core: [1.0, 0.9, 0.7], glow: [1.0, 0.32, 0.02], spark: [1.0, 0.6, 0.15], accent: [1.0, 0.1, 0.02] },
    { name: 'Toxic', core: [0.85, 1.0, 0.75], glow: [0.25, 1.0, 0.05], spark: [0.6, 1.0, 0.3], accent: [0.9, 1.0, 0.0] },
  ];
  let paletteIndex = 0;

  const size = () => ({
    w: Math.max(1, Math.floor(canvas.clientWidth || window.innerWidth)),
    h: Math.max(1, Math.floor(canvas.clientHeight || window.innerHeight)),
  });
  let { w: width, h: height } = size();

  // ---------------------------------------------------------------------------
  // 1. Renderer / Sahne / Kamera
  // ---------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CFG.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color(0x0b0c11);
  scene.background = HORIZON.clone();
  scene.fog = new THREE.Fog(HORIZON.clone(), 12, 38);

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.05, 400);

  // ---------------------------------------------------------------------------
  // 2. Yardimci fonksiyonlar
  // ---------------------------------------------------------------------------
  const disposables = [];
  const track = (o) => (disposables.push(o), o);
  const hdr = (rgb, k) => new THREE.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k);

  const GLSL_NOISE = /* glsl */ `
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
    }
    float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s; }
  `;

  function makeGridTexture(bg, line, px = 512, lw = 3) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, px, px);
    g.fillStyle = line;
    g.fillRect(0, 0, px, lw);
    g.fillRect(0, px - lw, px, lw);
    g.fillRect(0, 0, lw, px);
    g.fillRect(px - lw, 0, lw, px);
    const t = track(new THREE.CanvasTexture(c));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeRadialTexture(stops, px = 256) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
    stops.forEach(([o, col]) => grd.addColorStop(o, col));
    g.fillStyle = grd;
    g.fillRect(0, 0, px, px);
    const t = track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Kutulara dunya-olcekli UV (grid her yuzde ayni boyutta gorunsun)
  function worldUVBox(w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
      const x = pos.getX(i) + w / 2, y = pos.getY(i), z = pos.getZ(i) + d / 2;
      if (nx > 0.5) uv.setXY(i, z / CFG.cellSize, (y + h / 2) / CFG.cellSize);
      else if (ny > 0.5) uv.setXY(i, x / CFG.cellSize, z / CFG.cellSize);
      else uv.setXY(i, x / CFG.cellSize, (y + h / 2) / CFG.cellSize);
    }
    return track(g);
  }

  // Yan profil (u = ileri/Z, v = yukari/Y) -> X yonunde kalinlik
  function profile(points, thickness, bevel = 0.012) {
    const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16,
    });
    g.translate(0, 0, -thickness / 2);
    g.rotateY(-Math.PI / 2);
    return track(g);
  }

  // ---------------------------------------------------------------------------
  // 3. Ortam: gokyuzu kubbesi, environment map, isiklar
  // ---------------------------------------------------------------------------
  const skyUniforms = {
    uTop: { value: new THREE.Color(0x2a3f8a) },
    uMid: { value: new THREE.Color(0x16224d) },
    uHorizon: { value: HORIZON.clone() },
  };
  const sky = new THREE.Mesh(
    track(new THREE.SphereGeometry(200, 48, 24)),
    track(new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uMid, uHorizon; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(uHorizon, uMid, smoothstep(-0.005, 0.06, h));
          c = mix(c, uTop, smoothstep(0.05, 0.4, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    })),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // Parlak yuzeyler icin sahte "studio" environment (PMREM - core)
  {
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `varying vec3 vD; void main(){
          vec3 c = mix(vec3(0.015,0.016,0.02), vec3(0.06,0.09,0.22), smoothstep(-0.1,0.7,vD.y));
          gl_FragColor = vec4(c,1.); }`,
      }),
    );
    envScene.add(envSky);
    const panel = (w, h, color, pos) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    };
    panel(6, 2, new THREE.Color(2.2, 2.3, 2.6), new THREE.Vector3(0, 7, 2)); // ust softbox
    panel(3, 3, new THREE.Color(1.0, 1.05, 1.2), new THREE.Vector3(7, 3, -3)); // anahtar isik yonu
    panel(3, 2, new THREE.Color(1.6, 0.1, 1.2), new THREE.Vector3(-7, 1.5, -4)); // lazer yansimasi
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.85;
    track(envRT);
    pmrem.dispose();
    envScene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }

  scene.add(new THREE.HemisphereLight(0x3a4466, 0x050506, 0.5));

  const sun = new THREE.DirectionalLight(0xc8d2ff, 1.9);
  sun.position.set(7, 11, -5);
  sun.target.position.set(-1, 0, -0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  // kameradan gelen yumusak dolgu isigi (silahin beyaz panelleri okunsun)
  const fill = new THREE.DirectionalLight(0xd0d8ff, 0.9);
  fill.position.set(2, 3, 9);
  scene.add(fill);

  // ---------------------------------------------------------------------------
  // 4. Zemin + duvarlar (grid malzeme)
  // ---------------------------------------------------------------------------
  const gridMap = makeGridTexture('#1a1a1c', '#9a9a9e');
  const gridGlow = makeGridTexture('#000000', '#ffffff');
  const groundMat = track(new THREE.MeshStandardMaterial({
    map: gridMap, emissiveMap: gridGlow, emissive: 0xffffff, emissiveIntensity: 0.09,
    roughness: 0.82, metalness: 0.0,
  }));
  const GROUND = 240;
  gridMap.repeat.set(GROUND / CFG.cellSize, GROUND / CFG.cellSize);
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(GROUND, GROUND)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Duvarlar ayri texture kopyasi kullanir (repeat = 1, UV zaten dunya-olcekli)
  const wallMap = gridMap.clone(); wallMap.repeat.set(1, 1); wallMap.needsUpdate = true; track(wallMap);
  const wallGlow = gridGlow.clone(); wallGlow.repeat.set(1, 1); wallGlow.needsUpdate = true; track(wallGlow);
  const wallMat = track(new THREE.MeshStandardMaterial({
    map: wallMap, emissiveMap: wallGlow, emissive: 0xffffff, emissiveIntensity: 0.06, roughness: 0.8,
  }));
  const blockMat = track(new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.9 }));

  const addBox = (w, h, d, mat, x, z, rotY, y = h / 2) => {
    const m = new THREE.Mesh(worldUVBox(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // Hedef duvar
  const WALL = { w: 3.6, h: 2.5, d: 0.3, x: -3.4, z: -2.4, rot: 0.95 };
  const wall = addBox(WALL.w, WALL.h, WALL.d, wallMat, WALL.x, WALL.z, WALL.rot);
  // arkadaki uzun panel (referanstaki ust "cikinti")
  addBox(0.35, 3.1, 2.8, wallMat, WALL.x + Math.cos(WALL.rot) * 1.15 - 1.1, WALL.z - Math.sin(WALL.rot) * 1.15 - 1.2, WALL.rot);
  // sagdaki buyuk karanlik blok
  addBox(3.2, 2.4, 9, blockMat, 7.6, -3.2, 0.6);

  wall.updateMatrixWorld();
  const wallNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(wall.quaternion).normalize();
  const wallRight = new THREE.Vector3(1, 0, 0).applyQuaternion(wall.quaternion).normalize();
  const HIT = new THREE.Vector3(WALL.x, 1.62, WALL.z)
    .addScaledVector(wallRight, -0.35)
    .addScaledVector(wallNormal, WALL.d / 2 + 0.002);

  // ---------------------------------------------------------------------------
  // 5. Silah (prosedurel hard-surface model)
  // ---------------------------------------------------------------------------
  const M = {
    white: track(new THREE.MeshStandardMaterial({ color: 0xd6d9df, roughness: 0.28, metalness: 0.25 })),
    grey: track(new THREE.MeshStandardMaterial({ color: 0x6d7079, roughness: 0.35, metalness: 0.55 })),
    dark: track(new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.42, metalness: 0.7 })),
    black: track(new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.6, metalness: 0.4 })),
    red: track(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff1e0a, emissiveIntensity: 7, roughness: 0.4 })),
    redDim: track(new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a08, emissiveIntensity: 1.6, roughness: 0.4 })),
    pink: track(new THREE.MeshBasicMaterial({ color: hdr(PALETTES[0].glow, 9) })),
  };

  const gun = new THREE.Group();
  const gunParts = new THREE.Group(); // tum parcalar (golge ayari icin)
  gun.add(gunParts);
  const part = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    gunParts.add(m);
    return m;
  };
  const cylZ = (rt, rb, len, seg = 32) => track(new THREE.CylinderGeometry(rt, rb, len, seg).rotateX(Math.PI / 2));

  // -- Emitter (kirmizi izgarali silindir)
  part(cylZ(0.205, 0.215, 0.34, 48), M.dark, 0, 0, -0.36);
  part(track(new THREE.TorusGeometry(0.205, 0.022, 12, 48)), M.white, 0, 0, -0.19);
  part(track(new THREE.TorusGeometry(0.215, 0.02, 12, 48)), M.grey, 0, 0, -0.53);
  for (let i = 0; i < 4; i++) {
    const y = -0.105 + i * 0.07;
    const chord = 2 * Math.sqrt(Math.max(0, 0.212 ** 2 - y * y));
    part(track(new THREE.BoxGeometry(chord + 0.012, 0.03, 0.2)), M.red, 0, y, -0.36);
  }
  // -- Namlu konisi + pembe cekirdek
  part(cylZ(0.075, 0.15, 0.24, 40), M.dark, 0, 0, -0.08);
  part(cylZ(0.085, 0.085, 0.03, 40), M.grey, 0, 0, 0.045);
  const muzzleCore = part(track(new THREE.SphereGeometry(0.06, 24, 16)), M.pink, 0, 0, 0.05);
  muzzleCore.castShadow = false;

  // -- Catal seklindeki on bicaklar (3 adet)
  const prongGeo = profile([[-0.5, 0.13], [-0.05, 0.27], [0.35, 0.3], [0.62, 0.24], [0.86, 0.12], [0.6, 0.17], [0.3, 0.2], [0.0, 0.19], [-0.35, 0.09]], 0.07);
  [Math.PI / 2, Math.PI / 2 + 2.15, Math.PI / 2 - 2.15].forEach((a) => {
    part(prongGeo, [M.white, M.dark], 0, 0, 0, 0, 0, a - Math.PI / 2);
  });

  // -- Govde
  part(track(new THREE.BoxGeometry(0.3, 0.3, 1.6)), M.dark, 0, 0, -1.3);
  part(profile([[-0.5, 0.1], [-0.68, 0.27], [-1.5, 0.31], [-2.05, 0.27], [-2.75, 0.4], [-2.45, 0.16], [-1.6, 0.13], [-0.65, 0.09]], 0.36), [M.white, M.dark]);
  part(profile([[-0.55, -0.1], [-0.8, -0.24], [-2.0, -0.26], [-2.5, -0.16], [-2.2, -0.1], [-0.7, -0.08]], 0.32), [M.dark, M.grey]);
  // yan zirh plakalari
  const sidePlate = profile([[-0.62, -0.06], [-0.85, 0.12], [-1.75, 0.14], [-2.25, 0.02], [-1.9, -0.13], [-0.85, -0.13]], 0.025, 0.006);
  part(sidePlate, [M.white, M.grey], 0.175);
  part(sidePlate, [M.white, M.grey], -0.175);
  // havalandirma blogu (koyu zemin ustunde acik kareler)
  [1, -1].forEach((s) => {
    part(track(new THREE.BoxGeometry(0.03, 0.17, 0.42)), M.black, s * 0.2, -0.03, -1.32);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      part(track(new THREE.BoxGeometry(0.02, 0.055, 0.1)), M.grey, s * 0.215, -0.065 + r * 0.075, -1.46 + c * 0.13);
    }
    part(track(new THREE.BoxGeometry(0.012, 0.012, 0.5)), M.redDim, s * 0.19, 0.155, -1.0);
  });
  // tutamak
  part(track(new THREE.BoxGeometry(0.16, 0.5, 0.2)), M.dark, 0, -0.38, -1.6, 0.32);
  part(track(new THREE.BoxGeometry(0.17, 0.06, 0.26)), M.grey, 0, -0.62, -1.68, 0.32);
  // arka kanatlar
  const finGeo = profile([[-1.9, 0.0], [-2.2, 0.14], [-2.95, 0.3], [-2.55, 0.06]], 0.04, 0.008);
  part(finGeo, [M.white, M.dark], 0.16, 0.04, 0, 0, 0, -0.55);
  part(finGeo, [M.white, M.dark], -0.16, 0.04, 0, 0, 0, Math.PI + 0.55);
  // kucuk detaylar: ust ray + sensor
  part(track(new THREE.BoxGeometry(0.06, 0.04, 0.9)), M.grey, 0, 0.33, -1.2);
  part(cylZ(0.035, 0.035, 0.22, 16), M.dark, 0, 0.37, -0.75);
  part(track(new THREE.SphereGeometry(0.018, 12, 8)), M.red, 0, 0.37, -0.63);

  const GUN_POS = new THREE.Vector3(0.9, 1.22, 0.55);
  gun.position.copy(GUN_POS);
  gun.scale.setScalar(0.88);
  scene.add(gun);
  const MUZZLE_LOCAL = new THREE.Vector3(0, 0, 0.07);

  // ---------------------------------------------------------------------------
  // 6. Lazer isini (katmanli shader + elektrik iplikleri)
  // ---------------------------------------------------------------------------
  const beamUniforms = {
    uTime: { value: 0 },
    uLength: { value: 1 },
    uCore: { value: hdr(PALETTES[0].core, 1) },
    uGlow: { value: hdr(PALETTES[0].glow, 1) },
    uPulse: { value: 1 },
  };

  const beam = new THREE.Group();
  scene.add(beam);
  const unitTube = (r, radial, len) => track(new THREE.CylinderGeometry(r, r, 1, radial, len, true).rotateX(Math.PI / 2).translate(0, 0, 0.5));

  const beamVS = /* glsl */ `
    varying float vT; varying vec3 vN; varying vec3 vV; varying float vAng;
    void main(){
      vT = position.z; vAng = atan(position.y, position.x);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal); vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const beamLayer = (radius, intensity, power, colorMix, noiseAmt, speed) => new THREE.Mesh(
    unitTube(radius, 32, 96),
    track(new THREE.ShaderMaterial({
      uniforms: { ...beamUniforms, uI: { value: intensity }, uP: { value: power }, uMix: { value: colorMix }, uN: { value: noiseAmt }, uS: { value: speed } },
      vertexShader: beamVS,
      fragmentShader: /* glsl */ `
        uniform float uTime, uLength, uI, uP, uMix, uN, uS, uPulse; uniform vec3 uCore, uGlow;
        varying float vT; varying vec3 vN; varying vec3 vV; varying float vAng;
        ${GLSL_NOISE}
        void main(){
          float ndv = abs(dot(normalize(vN), normalize(vV)));
          float prof = pow(ndv, uP);
          float d = vT * uLength;
          float n = fbm(vec2(d * 3.0 - uTime * uS, vAng * 1.5 + uTime * 2.0));
          float streak = mix(1.0, 0.35 + 1.3 * n, uN);
          float ends = smoothstep(0.0, 0.025, vT) * smoothstep(1.0, 0.99, vT);
          float swell = 1.0 + 0.5 * smoothstep(0.55, 1.0, vT);  // carpma noktasina dogru kalinlasir
          vec3 col = mix(uGlow, uCore, uMix) * prof * uI * streak * ends * swell * uPulse;
          gl_FragColor = vec4(col, 1.0);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    })),
  );
  beam.add(beamLayer(0.01, 5, 0.8, 0.6, 0.45, 40)); // beyaz cekirdek
  beam.add(beamLayer(0.04, 1.5, 2.0, 0.08, 0.9, 30)); // ic parlama
  beam.add(beamLayer(0.13, 0.22, 3.0, 0.0, 1.0, 18)); // dis hale
  beam.children.forEach((m) => (m.frustumCulled = false));

  // Elektrik iplikleri: vertex shader icinde noise ile kivrilan ince tupler
  const strandMat = track(new THREE.ShaderMaterial({
    uniforms: { ...beamUniforms, uSeed: { value: 0 }, uAmp: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime, uLength, uSeed, uAmp; varying float vT; varying float vFlick;
      ${GLSL_NOISE}
      void main(){
        float z = position.z; vT = z;
        float d = z * uLength;
        float env = mix(0.01, 0.2, smoothstep(0.1, 1.0, z)) * (1.0 - 0.75 * smoothstep(0.96, 1.0, z)) * uAmp;
        float a = d * 2.2 - uTime * 7.0 + uSeed * 6.28;
        vec2 n = vec2(fbm(vec2(d * 1.6 - uTime * 9.0, uSeed * 11.0)), fbm(vec2(d * 1.6 - uTime * 9.0, uSeed * 23.0 + 5.0))) - 0.47;
        vec2 off = mat2(cos(a), -sin(a), sin(a), cos(a)) * (n * 2.0) * env;
        vFlick = vnoise(vec2(uTime * 18.0, uSeed * 40.0 + d * 0.8));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy + off, z, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore, uGlow; uniform float uPulse; varying float vT; varying float vFlick;
      void main(){
        float ends = smoothstep(0.0, 0.05, vT) * smoothstep(1.0, 0.97, vT);
        vec3 col = mix(uGlow, uCore, 0.3) * (2.6 + 5.0 * vFlick * vFlick) * ends * uPulse;
        gl_FragColor = vec4(col, 1.0);
      }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  }));
  const strandGeo = unitTube(0.0045, 4, 220);
  for (let i = 0; i < 9; i++) {
    const mat = strandMat.clone();
    mat.uniforms = { ...beamUniforms, uSeed: { value: i * 0.173 + 0.11 }, uAmp: { value: 0.6 + (i % 3) * 0.35 } };
    track(mat);
    const s = new THREE.Mesh(strandGeo, mat);
    s.frustumCulled = false;
    beam.add(s);
  }

  // ---------------------------------------------------------------------------
  // 7. Parlamalar (sprite) + isiklar
  // ---------------------------------------------------------------------------
  const softTex = makeRadialTexture([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,0.55)'], [0.45, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  const hotTex = makeRadialTexture([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]);

  const flare = (tex, color, scale) => {
    const s = new THREE.Sprite(track(new THREE.SpriteMaterial({
      map: tex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
    })));
    s.userData.base = scale;
    s.scale.setScalar(scale);
    scene.add(s);
    return s;
  };
  const impactFlares = [
    flare(softTex, hdr(PALETTES[0].glow, 0.9), 1.9),
    flare(softTex, hdr(PALETTES[0].glow, 2.5), 0.75),
    flare(hotTex, hdr(PALETTES[0].core, 9), 0.28),
  ];
  const muzzleFlares = [
    flare(softTex, hdr(PALETTES[0].glow, 1.6), 0.7),
    flare(hotTex, hdr(PALETTES[0].core, 6), 0.2),
  ];

  // duvar yuzeyindeki sicak leke
  const scorch = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1.5, 1.5)),
    track(new THREE.MeshBasicMaterial({
      map: softTex, color: hdr(PALETTES[0].glow, 0.9), blending: THREE.AdditiveBlending, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false,
    })),
  );
  scorch.position.copy(HIT).addScaledVector(wallNormal, 0.004);
  scorch.quaternion.copy(wall.quaternion);
  scene.add(scorch);

  const impactLight = new THREE.PointLight(hdr(PALETTES[0].glow, 1), 7, 4.5, 2);
  impactLight.position.copy(HIT).addScaledVector(wallNormal, 0.35);
  scene.add(impactLight);
  const muzzleLight = new THREE.PointLight(hdr(PALETTES[0].glow, 1), 3, 3, 2);
  scene.add(muzzleLight);
  const redLight = new THREE.PointLight(0xff2010, 1.2, 1.4, 2);
  redLight.position.set(0, 0, -0.36);
  gun.add(redLight);

  // ---------------------------------------------------------------------------
  // 8. Parcaciklar: carpma kivilcimlari (cizgi) + isin boyunca koz (nokta)
  // ---------------------------------------------------------------------------
  const rand = (a, b) => a + Math.random() * (b - a);
  const tmpV = new THREE.Vector3();

  // -- kivilcimlar
  const SP = CFG.sparkCount;
  const spPos = new Float32Array(SP * 6), spCol = new Float32Array(SP * 6);
  const spVel = new Float32Array(SP * 3), spP = new Float32Array(SP * 3), spLife = new Float32Array(SP), spMax = new Float32Array(SP);
  const sparkGeo = track(new THREE.BufferGeometry());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.LineSegments(sparkGeo, track(new THREE.LineBasicMaterial({
    vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  })));
  sparks.frustumCulled = false;
  scene.add(sparks);

  const respawnSpark = (i) => {
    // duvar normali etrafinda yari-kure
    tmpV.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    if (tmpV.dot(wallNormal) < 0) tmpV.reflect(wallNormal);
    tmpV.addScaledVector(wallNormal, 0.6).normalize();
    const sp = rand(0.6, 3.6) * (Math.random() < 0.15 ? 1.8 : 1);
    spVel[i * 3] = tmpV.x * sp; spVel[i * 3 + 1] = tmpV.y * sp + 0.6; spVel[i * 3 + 2] = tmpV.z * sp;
    spP[i * 3] = HIT.x + rand(-0.04, 0.04); spP[i * 3 + 1] = HIT.y + rand(-0.04, 0.04); spP[i * 3 + 2] = HIT.z + rand(-0.04, 0.04);
    spMax[i] = rand(0.25, 1.1);
    spLife[i] = spMax[i];
  };
  for (let i = 0; i < SP; i++) { respawnSpark(i); spLife[i] = Math.random() * spMax[i]; }

  // -- kozler (yuvarlak noktalar)
  const EM = CFG.emberCount;
  const emPos = new Float32Array(EM * 3), emCol = new Float32Array(EM * 3), emSize = new Float32Array(EM);
  const emVel = new Float32Array(EM * 3), emLife = new Float32Array(EM), emMax = new Float32Array(EM), emBase = new Float32Array(EM);
  const emberGeo = track(new THREE.BufferGeometry());
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emPos, 3).setUsage(THREE.DynamicDrawUsage));
  emberGeo.setAttribute('aColor', new THREE.BufferAttribute(emCol, 3).setUsage(THREE.DynamicDrawUsage));
  emberGeo.setAttribute('aSize', new THREE.BufferAttribute(emSize, 1).setUsage(THREE.DynamicDrawUsage));
  const emberMat = track(new THREE.ShaderMaterial({
    uniforms: { uScale: { value: height * dpr * 0.5 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vC;
      void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uScale / -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main(){ float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d); float core = smoothstep(0.16, 0.0, d);
        gl_FragColor = vec4(vC * (a * a * 0.8 + core * 1.6), 1.0); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  }));
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.frustumCulled = false;
  scene.add(embers);

  const beamStart = new THREE.Vector3(), beamDir = new THREE.Vector3();
  let beamLen = 1;
  const respawnEmber = (i) => {
    const atImpact = Math.random() < 0.55;
    const t = atImpact ? 1 - Math.pow(Math.random(), 2.5) * 0.25 : Math.pow(Math.random(), 0.6);
    tmpV.copy(beamStart).addScaledVector(beamDir, t * beamLen);
    const spread = atImpact ? 0.25 : 0.04 + 0.1 * t;
    emPos[i * 3] = tmpV.x + rand(-spread, spread);
    emPos[i * 3 + 1] = tmpV.y + rand(-spread, spread);
    emPos[i * 3 + 2] = tmpV.z + rand(-spread, spread);
    const v = atImpact ? 0.9 : 0.25;
    emVel[i * 3] = rand(-v, v) + wallNormal.x * (atImpact ? 0.5 : 0);
    emVel[i * 3 + 1] = rand(-v, v) + 0.15;
    emVel[i * 3 + 2] = rand(-v, v) + wallNormal.z * (atImpact ? 0.5 : 0);
    emMax[i] = rand(0.3, 1.2);
    emLife[i] = emMax[i];
    emBase[i] = rand(0.012, 0.045) * (Math.random() < 0.08 ? 2.2 : 1);
  };

  // ---------------------------------------------------------------------------
  // 9. Post-processing: HDR -> parlaklik filtresi -> 5 kademeli blur -> bilesim
  // ---------------------------------------------------------------------------
  const MIPS = 5;
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: false };
  const rtScene = track(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const rtBright = track(new THREE.WebGLRenderTarget(1, 1, rtOpts));
  const rtH = [], rtV = [], mipSize = [];
  for (let i = 0; i < MIPS; i++) {
    rtH.push(track(new THREE.WebGLRenderTarget(1, 1, rtOpts)));
    rtV.push(track(new THREE.WebGLRenderTarget(1, 1, rtOpts)));
  }

  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const fsGeo = track(new THREE.BufferGeometry());
  fsGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  fsGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  const fsQuad = new THREE.Mesh(fsGeo);
  fsQuad.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(fsQuad);
  const FS_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const blit = (mat, target) => { fsQuad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };

  const brightMat = track(new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uThreshold: { value: CFG.bloomThreshold }, uKnee: { value: CFG.bloomKnee } },
    vertexShader: FS_VS,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform float uThreshold, uKnee; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
        soft = soft * soft / (4.0 * uKnee + 1e-4);
        float w = max(soft, br - uThreshold) / max(br, 1e-4);
        gl_FragColor = vec4(min(c * w, vec3(60.0)), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  }));

  const KERNEL = 7;
  const gaussW = (() => {
    const sigma = KERNEL / 2.6, w = [];
    let sum = 0;
    for (let i = 0; i < KERNEL; i++) { w[i] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += i === 0 ? w[i] : 2 * w[i]; }
    return w.map((v) => v / sum);
  })();
  const blurMat = track(new THREE.ShaderMaterial({
    defines: { KERNEL },
    uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() }, uW: { value: gaussW } },
    vertexShader: FS_VS,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform vec2 uDir; uniform float uW[KERNEL]; varying vec2 vUv;
      void main(){
        vec3 s = texture2D(tDiffuse, vUv).rgb * uW[0];
        for (int i = 1; i < KERNEL; i++){
          vec2 o = uDir * float(i);
          s += (texture2D(tDiffuse, vUv + o).rgb + texture2D(tDiffuse, vUv - o).rgb) * uW[i];
        }
        gl_FragColor = vec4(s, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  }));

  const compositeMat = track(new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null },
      tB0: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, tB4: { value: null },
      uStrength: { value: CFG.bloomStrength },
      uTime: { value: 0 },
    },
    vertexShader: FS_VS,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene, tB0, tB1, tB2, tB3, tB4; uniform float uStrength, uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        // hafif kromatik sapma (kenarlara dogru)
        vec2 dc = vUv - 0.5; float r2 = dot(dc, dc);
        vec2 ca = dc * r2 * 0.012;
        vec3 c;
        c.r = texture2D(tScene, vUv - ca).r;
        c.g = texture2D(tScene, vUv).g;
        c.b = texture2D(tScene, vUv + ca).b;
        vec3 b = texture2D(tB0, vUv).rgb * 1.0 + texture2D(tB1, vUv).rgb * 0.95 + texture2D(tB2, vUv).rgb * 0.8
               + texture2D(tB3, vUv).rgb * 0.3 + texture2D(tB4, vUv).rgb * 0.15;
        c += b * uStrength * 0.28;
        c *= mix(1.0, smoothstep(1.0, 0.3, sqrt(r2) * 1.1), 0.4); // vinyet
        gl_FragColor = vec4(max(c, 0.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += (h(vUv * 1000.0 + fract(uTime)) - 0.5) / 255.0; // dithering
      }`,
    depthTest: false, depthWrite: false,
  }));

  function resizeTargets() {
    const W = Math.max(1, Math.floor(width * dpr)), H = Math.max(1, Math.floor(height * dpr));
    rtScene.setSize(W, H);
    let w = Math.max(1, W >> 1), h = Math.max(1, H >> 1);
    rtBright.setSize(w, h);
    for (let i = 0; i < MIPS; i++) {
      rtH[i].setSize(w, h);
      rtV[i].setSize(w, h);
      mipSize[i] = [w, h];
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    }
    emberMat.uniforms.uScale.value = H * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  }

  function renderFrame() {
    renderer.setRenderTarget(rtScene);
    renderer.render(scene, camera);

    brightMat.uniforms.tDiffuse.value = rtScene.texture;
    blit(brightMat, rtBright);

    let src = rtBright.texture;
    for (let i = 0; i < MIPS; i++) {
      const [w, h] = mipSize[i];
      blurMat.uniforms.tDiffuse.value = src;
      blurMat.uniforms.uDir.value.set(1 / w, 0);
      blit(blurMat, rtH[i]);
      blurMat.uniforms.tDiffuse.value = rtH[i].texture;
      blurMat.uniforms.uDir.value.set(0, 1 / h);
      blit(blurMat, rtV[i]);
      src = rtV[i].texture;
    }

    const u = compositeMat.uniforms;
    u.tScene.value = rtScene.texture;
    u.tB0.value = rtV[0].texture; u.tB1.value = rtV[1].texture; u.tB2.value = rtV[2].texture;
    u.tB3.value = rtV[3].texture; u.tB4.value = rtV[4].texture;
    blit(compositeMat, null);
  }

  // ---------------------------------------------------------------------------
  // 10. Kamera kontrolu (surukle / tekerlek) - addon gerektirmez
  // ---------------------------------------------------------------------------
  const orbitTarget = new THREE.Vector3(-0.3, 1.55, -0.7);
  const orbit = { theta: -0.02, phi: 1.31, radius: 8.0 };
  const goal = { ...orbit };
  let dragging = false, lastX = 0, lastY = 0, idleTime = 0;

  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    if (!dragging) return;
    goal.theta -= (e.clientX - lastX) * 0.006;
    goal.phi = THREE.MathUtils.clamp(goal.phi - (e.clientY - lastY) * 0.005, 0.35, 1.5);
    lastX = e.clientX; lastY = e.clientY; idleTime = 0;
  };
  const onUp = (e) => { dragging = false; canvas.releasePointerCapture?.(e.pointerId); };
  const onWheel = (e) => { e.preventDefault(); goal.radius = THREE.MathUtils.clamp(goal.radius * Math.exp(e.deltaY * 0.001), 3, 18); idleTime = 0; };
  const onDbl = () => shiftColour();
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', onDbl);

  function updateCamera(dt, t) {
    idleTime += dt;
    const k = 1 - Math.exp(-dt * 6);
    orbit.theta += (goal.theta - orbit.theta) * k;
    orbit.phi += (goal.phi - orbit.phi) * k;
    orbit.radius += (goal.radius - orbit.radius) * k;
    const sway = Math.min(1, Math.max(0, idleTime - 2) * 0.3); // bosta hafif sinematik salinim
    const th = orbit.theta + Math.sin(t * 0.17) * 0.05 * sway;
    const ph = orbit.phi + Math.sin(t * 0.23) * 0.015 * sway;
    camera.position.set(
      orbitTarget.x + orbit.radius * Math.sin(ph) * Math.sin(th),
      orbitTarget.y + orbit.radius * Math.cos(ph),
      orbitTarget.z + orbit.radius * Math.sin(ph) * Math.cos(th),
    );
    camera.lookAt(orbitTarget);
  }

  // ---------------------------------------------------------------------------
  // 11. Renk paleti
  // ---------------------------------------------------------------------------
  function applyPalette(p) {
    beamUniforms.uCore.value.setRGB(...p.core);
    beamUniforms.uGlow.value.setRGB(...p.glow);
    M.pink.color.copy(hdr(p.glow, 9));
    M.red.emissive.setRGB(...p.accent);
    M.redDim.emissive.setRGB(...p.accent);
    redLight.color.setRGB(...p.accent);
    impactFlares[0].material.color.copy(hdr(p.glow, 0.9));
    impactFlares[1].material.color.copy(hdr(p.glow, 2.5));
    impactFlares[2].material.color.copy(hdr(p.core, 9));
    muzzleFlares[0].material.color.copy(hdr(p.glow, 1.6));
    muzzleFlares[1].material.color.copy(hdr(p.core, 6));
    scorch.material.color.copy(hdr(p.glow, 0.9));
    impactLight.color.setRGB(...p.glow);
    muzzleLight.color.setRGB(...p.glow);
  }
  function shiftColour() {
    paletteIndex = (paletteIndex + 1) % PALETTES.length;
    applyPalette(PALETTES[paletteIndex]);
    return PALETTES[paletteIndex].name;
  }

  // ---------------------------------------------------------------------------
  // 12. Animasyon dongusu
  // ---------------------------------------------------------------------------
  let lastNow = performance.now();
  const muzzleWorld = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  let time = 0, paused = false, rafId = 0, disposed = false;

  function updateBeam() {
    gun.updateMatrixWorld(true);
    muzzleWorld.copy(MUZZLE_LOCAL).applyMatrix4(gun.matrixWorld);
    beamStart.copy(muzzleWorld);
    beamDir.subVectors(HIT, beamStart);
    beamLen = beamDir.length();
    beamDir.normalize();
    beam.position.copy(beamStart);
    beam.lookAt(HIT);
    beam.scale.set(1, 1, beamLen);
    beamUniforms.uLength.value = beamLen;
  }

  function updateParticles(dt) {
    const p = PALETTES[paletteIndex];
    // kivilcimlar
    for (let i = 0; i < SP; i++) {
      spLife[i] -= dt;
      if (spLife[i] <= 0) respawnSpark(i);
      const i3 = i * 3;
      spVel[i3 + 1] -= 7.5 * dt;
      const drag = Math.exp(-dt * 1.6);
      spVel[i3] *= drag; spVel[i3 + 1] *= drag; spVel[i3 + 2] *= drag;
      spP[i3] += spVel[i3] * dt; spP[i3 + 1] += spVel[i3 + 1] * dt; spP[i3 + 2] += spVel[i3 + 2] * dt;
      if (spP[i3 + 1] < 0.01) { spP[i3 + 1] = 0.01; spVel[i3 + 1] *= -0.35; spVel[i3] *= 0.6; spVel[i3 + 2] *= 0.6; }
      const life = spLife[i] / spMax[i];
      const tail = 0.022 + 0.018 * life;
      const o = i * 6;
      spPos[o] = spP[i3]; spPos[o + 1] = spP[i3 + 1]; spPos[o + 2] = spP[i3 + 2];
      spPos[o + 3] = spP[i3] - spVel[i3] * tail; spPos[o + 4] = spP[i3 + 1] - spVel[i3 + 1] * tail; spPos[o + 5] = spP[i3 + 2] - spVel[i3 + 2] * tail;
      const hot = life * life;
      const k = 6 * hot;
      const r = (p.spark[0] + (p.core[0] - p.spark[0]) * hot) * k;
      const g = (p.spark[1] + (p.core[1] - p.spark[1]) * hot) * k;
      const b = (p.spark[2] + (p.core[2] - p.spark[2]) * hot) * k;
      spCol[o] = r; spCol[o + 1] = g; spCol[o + 2] = b;
      spCol[o + 3] = r * 0.15; spCol[o + 4] = g * 0.15; spCol[o + 5] = b * 0.15;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;

    // kozler
    for (let i = 0; i < EM; i++) {
      emLife[i] -= dt;
      if (emLife[i] <= 0) respawnEmber(i);
      const i3 = i * 3;
      emPos[i3] += emVel[i3] * dt; emPos[i3 + 1] += emVel[i3 + 1] * dt; emPos[i3 + 2] += emVel[i3 + 2] * dt;
      const life = emLife[i] / emMax[i];
      const fade = Math.sin(life * Math.PI);
      const tw = 0.6 + 0.4 * Math.sin(time * 40 + i);
      emSize[i] = emBase[i] * (0.4 + 0.6 * fade);
      const k = 3.2 * fade * tw;
      emCol[i3] = (p.spark[0] * 0.7 + p.core[0] * 0.3) * k;
      emCol[i3 + 1] = (p.spark[1] * 0.7 + p.core[1] * 0.3) * k;
      emCol[i3 + 2] = (p.spark[2] * 0.7 + p.core[2] * 0.3) * k;
    }
    emberGeo.attributes.position.needsUpdate = true;
    emberGeo.attributes.aColor.needsUpdate = true;
    emberGeo.attributes.aSize.needsUpdate = true;
  }

  function placeFlare(s, at, pull, scaleMul) {
    toCam.subVectors(camera.position, at).normalize();
    s.position.copy(at).addScaledVector(toCam, pull);
    s.scale.setScalar(s.userData.base * scaleMul);
  }

  function update(dt) {
    time += dt;
    beamUniforms.uTime.value = time;
    compositeMat.uniforms.uTime.value = time;

    // silah hafif suzulme + geri tepme titresimi
    gun.position.set(
      GUN_POS.x + Math.sin(time * 0.9) * 0.01,
      GUN_POS.y + Math.sin(time * 1.3) * 0.025,
      GUN_POS.z + Math.sin(time * 37) * 0.002,
    );
    gun.lookAt(HIT.x, HIT.y + Math.sin(time * 1.3) * 0.02, HIT.z);
    updateBeam();

    const flick = 0.85 + 0.15 * Math.sin(time * 61) * Math.sin(time * 23.7) + 0.08 * Math.sin(time * 7.3);
    beamUniforms.uPulse.value = flick;
    impactLight.intensity = 7 * flick;
    muzzleLight.position.copy(muzzleWorld).addScaledVector(beamDir, 0.15);
    muzzleLight.intensity = 3 * flick;

    const ip = HIT.clone().addScaledVector(wallNormal, 0.03);
    placeFlare(impactFlares[0], ip, 0.6, 0.95 + 0.08 * flick);
    placeFlare(impactFlares[1], ip, 0.6, 0.9 + 0.2 * Math.sin(time * 33) * Math.sin(time * 11));
    placeFlare(impactFlares[2], ip, 0.6, 0.85 + 0.25 * flick);
    placeFlare(muzzleFlares[0], muzzleWorld, 0.25, 0.9 + 0.1 * flick);
    placeFlare(muzzleFlares[1], muzzleWorld, 0.25, 0.9 + 0.2 * flick);
    scorch.scale.setScalar(0.9 + 0.08 * flick);

    updateParticles(dt);
  }

  function loop() {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - lastNow) / 1000, 1 / 20);
    lastNow = now;
    if (!paused) update(dt);
    updateCamera(dt, time);
    sky.position.copy(camera.position);
    renderFrame();
  }

  // ---------------------------------------------------------------------------
  // 13. Boyutlandirma + baslatma
  // ---------------------------------------------------------------------------
  function resize() {
    const s = size();
    if (s.w === width && s.h === height && renderer.getPixelRatio() === dpr) return;
    width = s.w; height = s.h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
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
  applyPalette(PALETTES[0]);
  update(0);
  for (let i = 0; i < EM; i++) { respawnEmber(i); emLife[i] = Math.random() * emMax[i]; }
  // parcaciklari "isinmis" baslat
  for (let i = 0; i < 40; i++) updateParticles(1 / 60);
  loop();

  // ---------------------------------------------------------------------------
  // 14. Disa acik API (main.js / interaction.js hangi ismi cagirirsa calissin)
  // ---------------------------------------------------------------------------
  const setPaused = (v) => { paused = !!v; return paused; };
  function dispose() {
    disposed = true;
    cancelAnimationFrame(rafId);
    ro?.disconnect();
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('dblclick', onDbl);
    gunParts.traverse((o) => o.geometry?.dispose());
    disposables.forEach((d) => d.dispose?.());
    renderer.dispose();
  }

  const api = {
    scene, camera, renderer, gun, beam,
    shiftColour, shiftColor: shiftColour, shiftPalette: shiftColour, cyclePalette: shiftColour, nextPalette: shiftColour,
    setPalette: (i) => { paletteIndex = ((i % PALETTES.length) + PALETTES.length) % PALETTES.length; applyPalette(PALETTES[paletteIndex]); },
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    play: () => setPaused(false),
    setPaused,
    togglePause: () => setPaused(!paused),
    toggleMotion: () => setPaused(!paused), // interaction.js: true = durduruldu
    isPaused: () => paused,
    get paused() { return paused; },
    resize,
    render: renderFrame,
    update: () => {},
    dispose,
    destroy: dispose,
  };
  // Bilinmeyen bir metot cagrilirsa hata vermesin (sablonun main.js'i farkli isimler kullanabilir)
  return new Proxy(api, {
    get(target, key) {
      if (key in target || typeof key === 'symbol' || key === 'then' || key === 'toJSON') return target[key];
      return () => {};
    },
  });
}
