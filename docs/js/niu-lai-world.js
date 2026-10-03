import * as THREE from 'three';

// ---------- setup ----------
// phones/tablets: touch controls on from the start, and a lighter render load
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const HORIZON = new THREE.Color('#e4ecf2');
scene.fog = new THREE.Fog(HORIZON, 70, 280);
scene.background = HORIZON;
const fovFor = aspect => aspect < 1 ? 75 : 60;   // widen the view in portrait
const camera = new THREE.PerspectiveCamera(fovFor(innerWidth / innerHeight), innerWidth / innerHeight, 0.1, 2500);

scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f7a', 1.5));
const sun = new THREE.DirectionalLight('#fffaf0', 1.8);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(IS_TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 220 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// ---------- helpers ----------
let seed = 2021; // year of the Ox
const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const rr = (a, b) => a + rand() * (b - a);
const pick = arr => arr[Math.floor(rand() * arr.length)];
const clamp = THREE.MathUtils.clamp;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const lerpAngle = (a, b, t) => a + ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);

const matCache = {};
const mat = (color, extra) => extra ? new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra })
  : (matCache[color] ??= new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 }));
// SketchUp's signature look: every face gets a thin black edge
const EDGE = new THREE.LineBasicMaterial({ color: '#1e1e1e', transparent: true, opacity: 0.6 });
function mesh(geo, material, parent, pos, edges = true) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true; m.receiveShadow = true;
  if (pos) m.position.set(...pos);
  if (edges) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), EDGE));
  if (parent) parent.add(m);
  return m;
}
const blockers = [];                       // meshes the camera can't pass through
const block = m => (blockers.push(m), m);
// Static/kinematic collision shapes, all treated as vertical prisms:
//   circle { x, z, r, top }   or   box { x, z, hx, hz, rot, top }  (rot = the mesh's rotation.y)
// `top` is how high the shape is; anything you can get your feet above, you can stand on.
const colliders = [];
const circleCol = (x, z, r, top = Infinity) => { const c = { box: false, x, z, r, top }; colliders.push(c); return c; };
const boxCol = (x, z, hx, hz, rot, top = Infinity) => { const c = { box: true, x, z, hx, hz, rot, top }; colliders.push(c); return c; };
const COW_H = 3.4;   // anything lower than this at a spot is "in the way" of a standing cow
// widest horizontal reach of a tree crown within the cow's height band
function crownReach(cy, rx, ry = rx, cone = false) {
  if (cone) return cy - ry <= COW_H ? rx : 0;               // a cone is widest at its base
  if (cy <= COW_H) return rx;
  const k = 1 - ((cy - COW_H) / ry) ** 2;
  return k > 0 ? rx * Math.sqrt(k) : 0;
}
const animated = [];                       // per-frame world animation fns (t, dt)

// ---------- terrain ----------
const SIZE = 600, SEG = 150, CELL = SIZE / SEG, WATER = -3.5, WORLD_R = 172;
const VALLEY = new THREE.Vector2(-95, -75), VALLEY_GATE = Math.atan2(-VALLEY.y, -VALLEY.x);
const POND = VALLEY.clone().add(new THREE.Vector2(Math.cos(VALLEY_GATE + Math.PI), Math.sin(VALLEY_GATE + Math.PI)).multiplyScalar(12));
const LAKE = new THREE.Vector2(55, -70);
const desertF = (x, z) => smooth(45, 90, z + Math.sin(x * 0.03) * 15);
function height(x, z) {
  const d = Math.hypot(x, z);
  let h = Math.sin(x * 0.04) * Math.cos(z * 0.035) * 2.5 + Math.sin(x * 0.09 + z * 0.07) * 0.8
        + Math.sin(z * 0.015 + 2) * Math.cos(x * 0.02) * 3;
  const dunes = ((Math.sin(x * 0.07 + Math.sin(z * 0.05) * 1.5) * 0.5 + 0.5) ** 2) * 5 + Math.sin(z * 0.11) * 0.6;
  h = THREE.MathUtils.lerp(h, dunes, desertF(x, z));
  h *= Math.min(1, d / 25);
  const dv = Math.hypot(x - VALLEY.x, z - VALLEY.y);
  const pond = smooth(13, 4, Math.hypot(x - POND.x, z - POND.y));
  h = THREE.MathUtils.lerp(h, -2 - pond * 4, smooth(38, 22, dv));
  h += smooth(30, 38, dv) * smooth(50, 38, dv) * 6;            // valley rim
  h -= smooth(16, 5, Math.hypot(x - LAKE.x, z - LAKE.y)) * 6;   // a lake
  h += Math.max(0, d - 150) ** 1.3 * 0.35;                       // mountains at world edge
  return h;
}
// exact height of the rendered low-poly triangle under (x, z)
function groundAt(x, z) {
  const gx = (x + SIZE / 2) / CELL, gz = (z + SIZE / 2) / CELL;
  const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
  const v = i => i * CELL - SIZE / 2;
  const ha = height(v(ix), v(iz)), hb = height(v(ix), v(iz + 1)), hc = height(v(ix + 1), v(iz + 1)), hd = height(v(ix + 1), v(iz));
  return fx + fz <= 1 ? ha + (hd - ha) * fx + (hb - ha) * fz : hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
}
{
  let geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)));
  geo = geo.toNonIndexed();
  const pos = geo.attributes.position, colors = [];
  const c = new THREE.Color(), grass = new THREE.Color('#8cbf4a'), lush = new THREE.Color('#5fb85a'), sand = new THREE.Color('#e9d08f'),
        shore = new THREE.Color('#cfc58a'), rock = new THREE.Color('#a39e93');
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const h = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    c.copy(grass).lerp(sand, desertF(x, z)).lerp(lush, smooth(36, 26, Math.hypot(x - VALLEY.x, z - VALLEY.y)));
    if (h < WATER + 0.7) c.copy(shore);
    if (h > 9) c.lerp(rock, smooth(9, 18, h));
    c.offsetHSL(0, 0, rr(-0.03, 0.03));
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2),
    mat('#6fb7e0', { transparent: true, opacity: 0.8, roughness: 0.2 }));
  water.position.y = WATER;
  scene.add(water);
}

// ---------- sky + ink-wash mountains on the horizon ----------
{
  const skyGeo = new THREE.SphereGeometry(1300, 24, 12), cols = [], p = skyGeo.attributes.position;
  const top = new THREE.Color('#7fa9d6');
  for (let i = 0; i < p.count; i++) {
    const c = HORIZON.clone().lerp(top, Math.pow(Math.max(0, p.getY(i) / 1300), 0.5));
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  const sunBall = new THREE.Mesh(new THREE.IcosahedronGeometry(45, 1), new THREE.MeshBasicMaterial({ color: '#fff8d8', fog: false }));
  sunBall.position.set(500, 420, -800);
  scene.add(sunBall);

  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2 + rr(-0.05, 0.05), r = rr(450, 750), h = rr(110, 280);
    const geo = new THREE.ConeGeometry(rr(70, 150), h, pick([5, 6, 7]), 3);
    const ink = new THREE.Color('#3f4750').lerp(HORIZON, smooth(450, 800, r) * 0.7), mc = [], gp = geo.attributes.position;
    for (let k = 0; k < gp.count; k++) {
      const c = HORIZON.clone().lerp(ink, Math.pow((gp.getY(k) + h / 2) / h, 0.8));
      mc.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(mc, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    m.position.set(Math.cos(a) * r, h / 2 - rr(30, 60), Math.sin(a) * r);
    m.rotation.y = rand() * 6;
    scene.add(m);
  }
}

// ---------- placement helpers ----------
const inValley = (x, z) => Math.hypot(x - VALLEY.x, z - VALLEY.y) < 28;
const inDesert = (x, z) => desertF(x, z) > 0.6;
let MACHINE_HOME = new THREE.Vector2(110, 35);
const inGrass = (x, z) => desertF(x, z) < 0.3 && Math.hypot(x - VALLEY.x, z - VALLEY.y) > 46 && Math.hypot(x, z) > 12;
function spot(pred, R = 160) {
  for (let i = 0; i < 5000; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * R;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pred(x, z) && height(x, z) > WATER + 0.4) return [x, groundAt(x, z), z];
  }
  return [0, groundAt(0, 0), 0];
}
// Push a walker (circle of radius r, feet at feetY) out of every shape it overlaps.
// Returns the highest top it is standing on (-Infinity if none).
function resolve(p, r, feetY = -Infinity) {
  let support = -Infinity;
  for (const c of colliders) {
    const dx = p.x - c.x, dz = p.z - c.z;
    if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;      // cheap reject (largest shape is ~16 across)
    const onTop = feetY >= c.top - 0.35;                       // small step-up allowed
    if (!c.box) {
      const d = Math.hypot(dx, dz), min = c.r + r;
      if (d >= min) continue;
      if (onTop) { support = Math.max(support, c.top); continue; }
      const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
      p.x = c.x + nx * min; p.z = c.z + nz * min;
    } else {
      const cos = Math.cos(c.rot), sin = Math.sin(c.rot);
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;     // into the box's local frame
      const cx = clamp(lx, -c.hx, c.hx), cz = clamp(lz, -c.hz, c.hz);
      const ox = lx - cx, oz = lz - cz, od = Math.hypot(ox, oz);
      if (od >= r) continue;
      if (onTop) { support = Math.max(support, c.top); continue; }
      let nlx, nlz;
      if (od > 1e-4) { nlx = cx + ox / od * r; nlz = cz + oz / od * r; }
      else if (c.hx - Math.abs(lx) < c.hz - Math.abs(lz)) { nlx = Math.sign(lx || 1) * (c.hx + r); nlz = lz; }  // centre got inside: exit the nearest side
      else { nlx = lx; nlz = Math.sign(lz || 1) * (c.hz + r); }
      p.x = c.x + nlx * cos + nlz * sin; p.z = c.z - nlx * sin + nlz * cos;
    }
  }
  const dc = Math.hypot(p.x, p.z);
  if (dc > WORLD_R) { p.x *= WORLD_R / dc; p.z *= WORLD_R / dc; }
  return support;
}

// Moving creatures (you + NPCs) also shove each other. A body is one circle, or two along its heading for long animals.
const bodies = [];
const addBody = (obj, r, opts = {}) => { const b = { obj, r, len: opts.len ?? 0, mass: opts.mass ?? 1, height: opts.height ?? 2 }; bodies.push(b); return b; };
function bodyParts(b) {
  const p = b.obj.position;
  if (!b.len) return [[p.x, p.z]];
  const sx = Math.sin(b.obj.rotation.y) * b.len, sz = Math.cos(b.obj.rotation.y) * b.len;
  return [[p.x + sx, p.z + sz], [p.x - sx, p.z - sz]];
}
function separateBodies() {
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j], pa = a.obj.position, pb = b.obj.position;
    if (Math.abs(pa.x - pb.x) > 6 || Math.abs(pa.z - pb.z) > 6) continue;
    if (pa.y > pb.y + b.height - 0.2 || pb.y > pa.y + a.height - 0.2) continue;   // one is above the other (e.g. jumping over)
    const wa = (1 / a.mass) / (1 / a.mass + 1 / b.mass), wb = 1 - wa;
    for (const [ax, az] of bodyParts(a)) for (const [bx, bz] of bodyParts(b)) {
      const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), min = a.r + b.r;
      if (d >= min) continue;
      const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0, o = min - d;
      pa.x += nx * o * wa; pa.z += nz * o * wa;
      pb.x -= nx * o * wb; pb.z -= nz * o * wb;
    }
  }
}

// ---------- the cow (Niu Lai, walking upright for some reason) ----------
function makeCow(colors = {}) {
  const white = mat(colors.body ?? '#f7f3ea'), black = mat(colors.spot ?? '#26222a'), pink = mat('#ff9fb5'),
        hornM = mat('#e8cf86'), hoofM = mat('#3a2a20'), gold = mat('#ffcc33', { metalness: 0.6, roughness: 0.4 });
  const cow = new THREE.Group();
  const torso = new THREE.Group(); torso.position.y = 1.55; cow.add(torso);
  mesh(new THREE.IcosahedronGeometry(1, 1), white, torso).scale.set(0.75, 0.95, 0.6);
  const Z = new THREE.Vector3(0, 0, 1);
  [[0.6, 0.4, 0.5, 0.32], [-0.7, -0.1, 0.4, 0.26], [0.1, -0.5, -0.8, 0.4], [-0.4, 0.6, -0.6, 0.28],
   [0.9, -0.3, -0.2, 0.22], [-0.2, 0.1, 1, 0.18]].forEach(([x, y, z, s]) => {
    const n = new THREE.Vector3(x, y, z).normalize();
    const sp = mesh(new THREE.IcosahedronGeometry(s, 0), black, torso, [n.x * 0.72, n.y * 0.92, n.z * 0.57]);
    sp.scale.set(1, 1, 0.3);
    sp.quaternion.setFromUnitVectors(Z, n);
  });
  mesh(new THREE.IcosahedronGeometry(0.22, 1), pink, torso, [0, -0.6, 0.38]).scale.set(1.2, 0.8, 1);

  const head = new THREE.Group(); head.position.set(0, 1.05, 0.15); torso.add(head);
  mesh(new THREE.IcosahedronGeometry(0.5, 1), white, head).scale.set(1, 0.9, 1.05);
  mesh(new THREE.IcosahedronGeometry(0.17, 0), black, head, [0.25, 0.25, 0.33]).scale.set(1, 1, 0.4);
  mesh(new THREE.IcosahedronGeometry(0.5, 1), pink, head, [0, -0.14, 0.45]).scale.set(0.72, 0.48, 0.45);
  [-0.12, 0.12].forEach(x => mesh(new THREE.IcosahedronGeometry(0.05, 0), black, head, [x, -0.08, 0.66], false));
  const pupils = [];
  [[-0.2, 0.17, 0.36, 0.17], [0.23, 0.2, 0.34, 0.2]].forEach(([x, y, z, r]) => {
    mesh(new THREE.IcosahedronGeometry(r, 1), mat('#ffffff'), head, [x, y, z]);
    pupils.push(mesh(new THREE.IcosahedronGeometry(r * 0.45, 0), black, head, [x, y, z + r * 0.8], false));
  });
  [-1, 1].forEach(s => { mesh(new THREE.ConeGeometry(0.08, 0.38, 5), hornM, head, [s * 0.3, 0.45, -0.02]).rotation.z = -s * 0.55; });
  const ears = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.42, 0.15, -0.05); head.add(pivot);
    const e = mesh(new THREE.ConeGeometry(0.13, 0.4, 4), white, pivot, [s * 0.18, 0, 0]);
    e.rotation.z = -s * Math.PI / 2; e.scale.z = 0.5;
    return pivot;
  });
  [-0.08, 0, 0.08].forEach((x, i) => { mesh(new THREE.ConeGeometry(0.05, 0.22, 4), black, head, [x, 0.48, 0.05]).rotation.z = (i - 1) * -0.5; });
  mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.2, 6), gold, torso, [0, 0.62, 0.52]).rotation.x = 0.4;

  const arms = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.68, 0.42, 0.05); torso.add(pivot);
    mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.85, 6), white, pivot, [0, -0.42, 0]);
    mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.18, 6), hoofM, pivot, [0, -0.9, 0]);
    pivot.userData.side = s;
    return pivot;
  });
  const legs = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.32, 1.0, 0); cow.add(pivot);
    mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.85, 6), white, pivot, [0, -0.45, 0]);
    mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.18, 6), hoofM, pivot, [0, -0.92, 0.03]);
    return pivot;
  });
  const tail = new THREE.Group(); tail.position.set(0, -0.25, -0.55); torso.add(tail);
  mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 4), white, tail, [0, -0.3, -0.12]).rotation.x = 0.4;
  mesh(new THREE.IcosahedronGeometry(0.1, 0), black, tail, [0, -0.64, -0.26]);
  return { cow, torso, head, arms, legs, tail, ears, pupils };
}

// s: { t, phase, walk, run, air, mooing, look }
function poseCow(C, s) {
  const sw = Math.sin(s.phase), w = s.walk, run = s.run ?? 0, t = s.t;
  C.legs[0].rotation.x = s.air ? -0.6 : sw * 0.9 * w;
  C.legs[1].rotation.x = s.air ? 0.4 : -sw * 0.9 * w;
  C.legs[0].rotation.z = s.air ? -0.3 : 0;
  C.legs[1].rotation.z = s.air ? 0.3 : 0;
  C.arms.forEach((a, i) => {
    const side = a.userData.side;
    if (s.air) { a.rotation.x = 0; a.rotation.z = side * (2.2 + Math.sin(t * 25 + i) * 0.5); }
    else {
      a.rotation.x = (i ? sw : -sw) * 1.1 * w;
      a.rotation.z = side * (0.2 + run * (0.9 + Math.sin(s.phase * 2 + i * 2) * 0.5));
    }
  });
  C.torso.position.y = 1.55 + Math.abs(sw) * 0.14 * w + Math.sin(t * 2) * 0.03;
  C.torso.rotation.set(run * 0.25, sw * 0.1 * w, sw * 0.12 * w);
  C.head.rotation.x = s.mooing ? -0.6 + Math.sin(t * 30) * 0.05 : Math.sin(s.phase * 2) * 0.08 * w - run * 0.2;
  C.head.rotation.y = s.look ?? (1 - w) * Math.sin(t * 0.7) * 0.6;
  C.head.rotation.z = sw * 0.18 * w + Math.sin(t * 0.9) * 0.1;
  C.ears.forEach((e, i) => { e.rotation.z = (i ? -1 : 1) * (Math.sin(t * 3 + i) * 0.15 + w * Math.abs(sw) * 0.4 + (s.air ? 0.8 : 0)); });
  C.tail.rotation.z = Math.sin(t * 3) * 0.4 + sw * 0.5 * w;
  C.tail.rotation.x = s.air ? -0.8 : 0;
  C.pupils.forEach((p, i) => { p.position.x = (i ? 0.23 : -0.2) + Math.sin(t * 9 + i * 2) * 0.03 * (0.3 + w); });
}

const C = makeCow();
const cow = C.cow;
scene.add(cow);
cow.position.set(0, groundAt(0, 0), 0);

// ---------- four-legged friends and foes (boxes, like SketchUp intended) ----------
function makeQuad(o) {
  const g = new THREE.Group(), body = mat(o.body), dark = mat('#1d1a17');
  const top = o.legH + o.bh;
  mesh(new THREE.BoxGeometry(o.w, o.bh, o.len), body, g, [0, o.legH + o.bh / 2, 0]);
  if (o.spot) for (let i = 0; i < 14; i++) {
    const side = pick([-1, 0, 1]), z = rr(-o.len / 2 + 0.2, o.len / 2 - 0.2);
    if (side === 0) mesh(new THREE.BoxGeometry(0.18, 0.04, 0.22), mat(o.spot), g, [rr(-o.w / 2 + 0.15, o.w / 2 - 0.15), top + 0.01, z], false);
    else mesh(new THREE.BoxGeometry(0.04, 0.18, 0.22), mat(o.spot), g, [side * (o.w / 2 + 0.01), rr(o.legH + 0.15, top - 0.12), z], false);
  }
  const head = new THREE.Group(); head.position.set(0, top - 0.05, o.len / 2 + 0.15); g.add(head);
  mesh(new THREE.BoxGeometry(0.6, 0.5, 0.55), body, head, [0, 0.1, 0.15]);
  mesh(new THREE.BoxGeometry(0.36, 0.26, o.snout), mat(o.snoutColor ?? o.body), head, [0, -0.02, 0.42 + o.snout / 2]);
  mesh(new THREE.BoxGeometry(0.14, 0.09, 0.06), dark, head, [0, 0.07, 0.43 + o.snout], false);
  [-1, 1].forEach(s => {
    mesh(new THREE.BoxGeometry(0.1, 0.1, 0.04), mat(o.eye ?? '#222'), head, [s * 0.17, 0.2, 0.43], false);
    if (o.pointy) mesh(new THREE.ConeGeometry(0.12, 0.35, 4), body, head, [s * 0.2, 0.5, 0.05]);
    else mesh(new THREE.BoxGeometry(0.18, 0.16, 0.06), body, head, [s * 0.24, 0.4, 0.05]);
  });
  const legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
    const pivot = new THREE.Group(); pivot.position.set(sx * (o.w / 2 - 0.12), o.legH, sz * (o.len / 2 - 0.2)); g.add(pivot);
    mesh(new THREE.BoxGeometry(0.2, o.legH, 0.2), body, pivot, [0, -o.legH / 2, 0]);
    return pivot;
  });
  const tail = new THREE.Group(); tail.position.set(0, top - 0.1, -o.len / 2); g.add(tail);
  mesh(new THREE.BoxGeometry(0.1, 0.1, o.tailLen), body, tail, [0, 0, -o.tailLen / 2]);
  tail.rotation.x = -0.4;
  return { g, legs, head, tail, phase: 0, walk: 0, heading: 0, target: new THREE.Vector3(), timer: 0, speed: 0 };
}
function poseQuad(Q, t) {
  const sw = Math.sin(Q.phase);
  Q.legs.forEach((l, i) => { l.rotation.x = sw * 0.7 * Q.walk * (i === 0 || i === 3 ? 1 : -1); });
  Q.tail.rotation.y = Math.sin(t * 4) * 0.4;
  Q.g.children[0].position.y = Q.legs[0].position.y + Q.g.children[0].geometry.parameters.height / 2 + Math.abs(sw) * 0.06 * Q.walk;
}
// walk an agent's group toward a point; returns speed actually moved
function steer(A, obj, tx, tz, speed, dt, r = 0.8) {
  const dx = tx - obj.position.x, dz = tz - obj.position.z, d = Math.hypot(dx, dz);
  let moved = 0;
  if (d > 0.3) {
    const step = Math.min(d, speed * dt);
    obj.position.x += dx / d * step; obj.position.z += dz / d * step;
    A.heading = lerpAngle(A.heading, Math.atan2(dx, dz), damp(6, dt));
    moved = step / dt;
  }
  resolve(obj.position, r);
  obj.position.y = groundAt(obj.position.x, obj.position.z);
  obj.rotation.y = A.heading;
  A.walk = THREE.MathUtils.lerp(A.walk, Math.min(1, moved / 4), damp(8, dt));
  A.phase += dt * (2 + moved * 1.3);
  return moved;
}

// ---------- GRASSLAND ----------
// chunky 3D trees
for (let i = 0; i < 60; i++) {
  const [x, y, z] = spot(inGrass);
  const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
  const h = rr(2.5, 5), r = rr(1.6, 3);
  block(mesh(new THREE.CylinderGeometry(0.3, 0.45, h, 6), mat('#7a5634'), g, [0, h / 2, 0]));
  const kind = Math.floor(rand() * 3);
  const crown = block(mesh([new THREE.IcosahedronGeometry(r, 0), new THREE.ConeGeometry(r, r * 2.4, 6), new THREE.DodecahedronGeometry(r, 0)][kind],
    mat(pick(['#4f9a3c', '#5aa845', '#3f8a3a', '#6cb04a'])), g, [0, h + r * 0.7, 0]));
  crown.rotation.y = rand() * 6;
  circleCol(x, z, Math.max(0.45, 0.85 * (kind === 1 ? crownReach(h + r * 0.7, r, r * 1.2, true) : crownReach(h + r * 0.7, r))));
}
// SketchUp "face-me" cutout trees: flat, and they always turn to look at you
const faceMe = [];
for (let i = 0; i < 30; i++) {
  const [x, y, z] = spot((a, b) => inGrass(a, b) || inValley(a, b));
  const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
  const s = rr(0.8, 1.4);
  mesh(new THREE.PlaneGeometry(0.5 * s, 2.5 * s), mat('#6b4a2b', { side: THREE.DoubleSide }), g, [0, 1.25 * s, 0]);
  const shape = new THREE.Shape();
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, rad = rr(0.75, 1.05);
    const px = Math.cos(a) * 1.8 * s * rad, py = 4.2 * s + Math.sin(a) * 2.2 * s * rad;
    k ? shape.lineTo(px, py) : shape.moveTo(px, py);
  }
  mesh(new THREE.ShapeGeometry(shape), mat(pick(['#4c8f3a', '#5ea347']), { side: THREE.DoubleSide }), g, [0, 0, 0.01]);
  faceMe.push(g);
  circleCol(x, z, Math.max(0.3, 0.85 * crownReach(4.2 * s, 1.8 * s, 2.2 * s)));
}
// grass + flowers
{
  const N = 1600, grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 1, 3), mat('#ffffff', {}), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const [x, y, z] = spot((a, b) => (inGrass(a, b) || inValley(a, b) || Math.hypot(a, b) < 12));
    const s = rr(0.5, 1.4), flower = rand() < 0.15;
    q.setFromEuler(e.set(rr(-0.3, 0.3), rand() * 6, rr(-0.3, 0.3)));
    m.compose(new THREE.Vector3(x, y + (flower ? 0.2 : 0.4 * s), z), q, flower ? new THREE.Vector3(0.6, 0.4, 0.6) : new THREE.Vector3(s, s * rr(0.8, 1.5), s));
    grass.setMatrixAt(i, m);
    grass.setColorAt(i, c.set(flower ? pick(['#ffffff', '#ffd23f', '#ff6f91', '#b388ff']) : pick(['#6fae3c', '#87c04a', '#5e9e3a'])));
  }
  grass.receiveShadow = true;
  scene.add(grass);
}
// boulders
for (let i = 0; i < 25; i++) {
  const [x, y, z] = spot((a, b) => inGrass(a, b) || inDesert(a, b));
  const r = rr(0.8, 2.6), sy = rr(0.6, 1);
  const rock = block(mesh(new THREE.DodecahedronGeometry(r, 0), mat(pick(['#9e9a90', '#b3ab98', '#8d877c'])), scene, [x, y + r * 0.3, z]));
  rock.rotation.set(rr(-0.15, 0.15), rand() * 6, rr(-0.15, 0.15));
  rock.scale.y = sy;
  circleCol(x, z, r * 0.88, y + r * 0.3 + r * sy * 0.8);
}

// ---------- DESERT ----------
for (let i = 0; i < 35; i++) {
  const [x, y, z] = spot(inDesert);
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rand() * 6; scene.add(g);
  const h = rr(2, 5), cm = mat('#4f9a52');
  block(mesh(new THREE.BoxGeometry(0.7, h, 0.7), cm, g, [0, h / 2, 0]));
  let minX = -0.35, maxX = 0.35;
  [-1, 1].forEach(s => {
    if (rand() < 0.3) return;
    const ay = rr(1, h - 0.6), ah = rr(0.8, 1.6);
    mesh(new THREE.BoxGeometry(0.7, 0.45, 0.45), cm, g, [s * 0.65, ay, 0]);
    mesh(new THREE.BoxGeometry(0.45, ah, 0.45), cm, g, [s * 0.95, ay + ah / 2, 0]);
    if (s < 0) minX = -1.18; else maxX = 1.18;
  });
  const mid = (minX + maxX) / 2, rot = g.rotation.y;
  boxCol(x + mid * Math.cos(rot), z - mid * Math.sin(rot), (maxX - minX) / 2, 0.35, rot);
}
// sun-bleached bones
for (let i = 0; i < 12; i++) {
  const [x, y, z] = spot(inDesert);
  const g = new THREE.Group(); g.position.set(x, y + 0.2, z); g.rotation.y = rand() * 6; scene.add(g);
  const bone = mat('#f2ead8');
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 5), bone, g).rotation.z = Math.PI / 2;
  for (let k = 0; k < 5; k++) {
    const rib = mesh(new THREE.TorusGeometry(0.8, 0.08, 3, 6, Math.PI), bone, g, [-1.2 + k * 0.6, 0, 0]);
    rib.rotation.y = Math.PI / 2;
  }
}

// ---------- HIDDEN VALLEY ----------
{
  // ring of cliffs with one gap facing the grassland
  for (let a = 0; a < Math.PI * 2; a += 0.17) {
    const off = Math.abs(((a - VALLEY_GATE + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
    if (off < 0.28) continue;
    const r = rr(37, 41), x = VALLEY.x + Math.cos(a) * r, z = VALLEY.y + Math.sin(a) * r;
    const h = rr(14, 26), w = rr(6, 9);
    const cliff = block(mesh(new THREE.BoxGeometry(w, h, w * 0.8), mat(pick(['#a39e93', '#b5ad9c', '#8f8a80'])), scene, [x, groundAt(x, z) + h / 2 - 2, z]));
    cliff.rotation.set(rr(-0.08, 0.08), Math.PI / 2 - a + rr(-0.3, 0.3), rr(-0.08, 0.08));
    boxCol(x, z, w / 2, w * 0.4, cliff.rotation.y);
  }
  // waterfall on the far wall, pouring into the pond
  const wa = VALLEY_GATE + Math.PI, wx = VALLEY.x + Math.cos(wa) * 29, wz = VALLEY.y + Math.sin(wa) * 29;
  const wg = new THREE.Group(); wg.position.set(wx, groundAt(wx, wz), wz); wg.rotation.y = -Math.PI / 2 - wa; scene.add(wg);
  block(mesh(new THREE.BoxGeometry(14, 24, 6), mat('#9b968b'), wg, [0, 10, -2]));
  mesh(new THREE.BoxGeometry(4, 22, 0.4), mat('#9fd8f5', { emissive: '#3a7fb0', emissiveIntensity: 0.4 }), wg, [0, 9, 1.2]);
  const wr = wg.rotation.y;
  boxCol(wx - 2 * Math.sin(wr), wz - 2 * Math.cos(wr), 7, 3, wr);
  const drops = [];
  for (let i = 0; i < 14; i++) drops.push(mesh(new THREE.BoxGeometry(0.6, 1.2, 0.3), mat('#ffffff'), wg, [rr(-1.6, 1.6), 0, 1.5], false));
  animated.push(t => drops.forEach((d, i) => { d.position.y = 20 - ((t * 9 + i * 1.6) % 22); }));
  // lush trees inside
  for (let i = 0; i < 18; i++) {
    const [x, y, z] = spot(inValley);
    const g = new THREE.Group(); g.position.set(x, y, z); scene.add(g);
    block(mesh(new THREE.CylinderGeometry(0.3, 0.4, 3, 6), mat('#7a5634'), g, [0, 1.5, 0]));
    const cr = rr(1.8, 2.6);
    block(mesh(new THREE.IcosahedronGeometry(cr, 0), mat(pick(['#3f9b4a', '#e88fb0', '#f4b6c8'])), g, [0, 4, 0]));
    circleCol(x, z, Math.max(0.45, 0.85 * crownReach(4, cr)));
  }
}
// the herd, waiting in the valley
const herd = [];
for (let i = 0; i < 9; i++) {
  const [x, y, z] = spot(inValley);
  const H = makeCow(pick([{ body: '#f7f3ea' }, { body: '#b07a4a', spot: '#5a3a22' }, { body: '#e8d8b8', spot: '#7a5a3a' }, { body: '#5a4a42', spot: '#f0e8dc' }]));
  H.cow.position.set(x, y, z);
  const sc = rr(0.9, 1.3); H.cow.scale.setScalar(sc);
  scene.add(H.cow);
  herd.push({ C: H, heading: rand() * 6, phase: 0, walk: 0, timer: rr(0, 4), target: new THREE.Vector3(x, y, z), moo: 0, toff: rand() * 10, r: 0.75 * sc });
  addBody(H.cow, 0.75 * sc, { mass: 2, height: COW_H * sc });
}

// ---------- characters ----------
// Mother, waiting near where you wake up
const mother = makeCow({ body: '#b8865a', spot: '#5a3a22' });
mother.cow.scale.setScalar(1.45);
mother.cow.position.set(6, groundAt(6, 8), 8);
scene.add(mother.cow);
circleCol(6, 8, 1.15, mother.cow.position.y + COW_H * 1.45);
const motherState = { heading: 0 };

// Bao La the leopard
const bao = makeQuad({ body: '#e8a63a', spot: '#2a1f14', snoutColor: '#f6dfb4', eye: '#2b6b2b', w: 0.8, bh: 0.7, len: 2.0, legH: 0.8, snout: 0.25, tailLen: 1.6 });
bao.g.position.set(-25, groundAt(-25, 25), 25);
bao.home = new THREE.Vector3(-25, 0, 25);
scene.add(bao.g);
addBody(bao.g, 0.6, { len: 0.6, mass: 1.5, height: 1.9 });

// wolves
const wolves = [];
const WOLF_DEN = new THREE.Vector3(60, 0, -25);
for (let i = 0; i < 3; i++) {
  const W = makeQuad({ body: pick(['#7d828c', '#6b6f78', '#8f939b']), snoutColor: '#c9ccd2', eye: '#e8c020', w: 0.75, bh: 0.75, len: 1.9, legH: 0.9, snout: 0.5, pointy: true, tailLen: 1.0 });
  W.ang = i / 3 * Math.PI * 2; W.noticed = false; W.howl = 0;
  W.g.position.set(WOLF_DEN.x + Math.cos(W.ang) * 12, 0, WOLF_DEN.z + Math.sin(W.ang) * 12);
  scene.add(W.g);
  addBody(W.g, 0.6, { len: 0.55, height: 2 });
  wolves.push(W);
}

// the skylark
const lark = new THREE.Group();
{
  const brown = mat('#8a6a48');
  mesh(new THREE.OctahedronGeometry(0.28, 0), brown, lark).scale.set(0.8, 0.8, 1.4);
  mesh(new THREE.ConeGeometry(0.06, 0.2, 4), mat('#e3a23a'), lark, [0, 0.05, 0.45]).rotation.x = Math.PI / 2;
  mesh(new THREE.ConeGeometry(0.08, 0.25, 4), brown, lark, [0, 0.3, 0.05]); // crest
  const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.25), new THREE.Vector3(0.9, 0, -0.1), new THREE.Vector3(0, 0, -0.25)]);
  wingGeo.computeVertexNormals();
  lark.userData.wings = [-1, 1].map(s => {
    const w = mesh(wingGeo, mat('#a07c55', { side: THREE.DoubleSide }), lark);
    w.scale.x = s;
    return w;
  });
}
scene.add(lark);
const larkState = { ang: 0, pos: new THREE.Vector3(0, 6, 0), chirpIn: 6 };

// ---------- THE MACHINE (rampaging) ----------
const machine = new THREE.Group();
const machineParts = {};
{
  const metal = mat('#6b7078', { metalness: 0.5, roughness: 0.5 }), dark = mat('#3b3f45', { metalness: 0.4, roughness: 0.6 }), rust = mat('#9a5a32');
  block(mesh(new THREE.BoxGeometry(12, 6, 9), metal, machine, [0, 4.5, 0]));
  block(mesh(new THREE.BoxGeometry(4.5, 8, 4.5), dark, machine, [-3, 11.5, -1.5]));
  block(mesh(new THREE.CylinderGeometry(0.9, 1.2, 7, 6), rust, machine, [3.5, 11, -2]));
  // treads
  [-1, 1].forEach(s => block(mesh(new THREE.BoxGeometry(2.5, 2.2, 11), dark, machine, [s * 6.3, 1.1, 0])));
  // gears
  machineParts.gears = [-1, 1].map(s => {
    const gear = new THREE.Group(); gear.position.set(s * 6.2, 5.5, 2.5); machine.add(gear);
    const disc = mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.6, 10), rust, gear); disc.rotation.z = Math.PI / 2;
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      mesh(new THREE.BoxGeometry(0.6, 0.8, 0.8), rust, gear, [0, Math.cos(a) * 2.6, Math.sin(a) * 2.6]).rotation.x = -a;
    }
    return gear;
  });
  // pistons
  machineParts.pistons = [-2, 0, 2].map(x => mesh(new THREE.BoxGeometry(1, 3, 1), metal, machine, [x + 1, 8, 3.2]));
  // the eye
  const eye = new THREE.Group(); eye.position.set(-3, 12, 0.9); machine.add(eye);
  mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.8, 8), dark, eye).rotation.x = Math.PI / 2;
  machineParts.eyeMat = mat('#ff2a2a', { emissive: '#ff0000', emissiveIntensity: 1 });
  mesh(new THREE.IcosahedronGeometry(0.9, 1), machineParts.eyeMat, eye, [0, 0, 0.45]);
  machineParts.eye = eye;
  // claw arm
  const arm = new THREE.Group(); arm.position.set(0, 6, 4.5); machine.add(arm);
  mesh(new THREE.BoxGeometry(1, 1, 6), metal, arm, [0, 0, 3]);
  mesh(new THREE.BoxGeometry(2.4, 0.5, 1.4), rust, arm, [0, -0.4, 6.2]);
  machineParts.arm = arm;
  // antenna light
  machineParts.beacon = mat('#ffd400', { emissive: '#ffaa00', emissiveIntensity: 1 });
  mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 4), dark, machine, [-3, 17.5, -1.5]);
  mesh(new THREE.IcosahedronGeometry(0.4, 0), machineParts.beacon, machine, [-3, 19.6, -1.5]);
  // smoke
  machineParts.smoke = [];
  for (let i = 0; i < 8; i++) machineParts.smoke.push(mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), mat('#5a5a5a', { transparent: true, opacity: 0.6 }), machine, [3.5, 15, -2], false));
}
machine.position.set(MACHINE_HOME.x, groundAt(MACHINE_HOME.x, MACHINE_HOME.y), MACHINE_HOME.y);
scene.add(machine);
const machineCol = boxCol(0, 0, 7.6, 5.6, 0);
const machineState = { t: 0, heading: 0 };

// clouds (cuboid, obviously)
for (let i = 0; i < 24; i++) {
  const g = new THREE.Group(), cm = mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.3 });
  const n = 2 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const s = rr(4, 8);
    mesh(new THREE.BoxGeometry(s * 1.6, s * 0.6, s), cm, g, [k * 6 - n * 3, rr(-1, 1), rr(-2, 2)], false).castShadow = false;
  }
  g.position.set(rr(-260, 260), rr(50, 75), rr(-260, 260));
  scene.add(g);
  const sp = rr(1, 3);
  animated.push((t, dt) => { g.position.x += sp * dt; if (g.position.x > 300) g.position.x = -300; });
}

// ---------- audio ----------
let actx = null, hum = null;
function moo(vol = 0.25, pitch = 1) {
  if (!actx) return;
  const t = actx.currentTime, base = rr(120, 170) * pitch;
  const out = actx.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(vol, t + 0.12);
  out.gain.setValueAtTime(vol, t + 0.8);
  out.gain.linearRampToValueAtTime(0, t + 1.25);
  const filter = actx.createBiquadFilter();
  filter.type = 'lowpass'; filter.Q.value = 6;
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.linearRampToValueAtTime(1100, t + 0.35);
  filter.frequency.linearRampToValueAtTime(350, t + 1.2);
  filter.connect(out).connect(actx.destination);
  const lfo = actx.createOscillator(), lg = actx.createGain();
  lfo.frequency.value = 6; lg.gain.value = 4; lfo.connect(lg);
  [1, 1.01].forEach(mul => {
    const o = actx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 1.15 * mul, t);
    o.frequency.linearRampToValueAtTime(base * mul, t + 0.3);
    o.frequency.linearRampToValueAtTime(base * 0.8 * mul, t + 1.2);
    lg.connect(o.frequency); o.connect(filter); o.start(t); o.stop(t + 1.3);
  });
  lfo.start(t); lfo.stop(t + 1.3);
}
function tone(type, freqs, dur, vol) {
  if (!actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freqs[0][0], t);
  freqs.slice(1).forEach(([f, at]) => o.frequency.linearRampToValueAtTime(f, t + at));
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur / 4));
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
const chirp = vol => [0, 0.12, 0.22].forEach((d, i) => setTimeout(() => tone('sine', [[2600 + i * 400, 0], [3800, 0.05], [3000, 0.09]], 0.1, vol), d * 1000));
const howl = vol => tone('sine', [[320, 0], [620, 0.5], [580, 1.4], [420, 2]], 2, vol);
function startAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;   // older iOS Safari only has the prefixed one
  if (!AC) return;
  actx = new AC();
  // the machine's low grind, louder as you get closer
  const o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain();
  o.type = 'sawtooth'; o.frequency.value = 48; f.type = 'lowpass'; f.frequency.value = 180; g.gain.value = 0;
  o.connect(f).connect(g).connect(actx.destination); o.start();
  hum = g;
}

// ---------- input ----------
const keys = {};
let mooTimer = 0, stutter = false;
const mooEl = document.getElementById('moo');
function playerMoo() {
  mooTimer = 1.3;
  mooEl.textContent = pick(['MOOO!', 'MOO?', 'mooooo', 'MÖÖÖ', 'moo.', '哞~']);
  moo();
}
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyM') playerMoo();
  if (e.code === 'KeyP') { stutter = !stutter; drawHud(); }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// Mouse and touch share one pointer system:
//   - a touch that starts on the left part of the screen becomes a virtual joystick
//   - any other pointer drags the camera; two of them pinch-zoom
let yaw = 0, pitch = 0.3, dist = 11;
const cv = renderer.domElement;
const lookers = new Map();                       // pointerId -> last {x, y}
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, mag: 0 };
const touchBtn = { jump: false };
const stickEl = document.getElementById('stick'), knobEl = document.getElementById('knob');
const STICK_R = 55;
let pinchDist = 0;

function enableTouchUI() {
  if (document.body.classList.contains('touch')) return;
  document.body.classList.add('touch');
  drawHud();
}
const pinchSpan = () => { const [a, b] = [...lookers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
function placeStick(x, y, active) {
  stickEl.style.left = x + 'px'; stickEl.style.top = y + 'px';
  stickEl.classList.toggle('active', active);
}
function resetStick() {
  joy.id = null; joy.x = joy.y = joy.mag = 0;
  knobEl.style.transform = 'translate(-50%, -50%)';
  stickEl.removeAttribute('style');           // back to its resting spot from the CSS
  stickEl.classList.remove('active');
}

cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  if (e.pointerType === 'touch') {
    enableTouchUI();
    if (joy.id === null && e.clientX < innerWidth * 0.45) {
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY;
      placeStick(e.clientX, e.clientY, true);
      return;
    }
  }
  lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (lookers.size === 2) pinchDist = pinchSpan();
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const m = Math.hypot(dx, dy);
    if (m > STICK_R) { dx *= STICK_R / m; dy *= STICK_R / m; }
    joy.x = dx / STICK_R; joy.y = -dy / STICK_R; joy.mag = Math.min(1, m / STICK_R);
    knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    return;
  }
  const p = lookers.get(e.pointerId);
  if (!p) return;
  if (lookers.size === 1) {
    const k = e.pointerType === 'touch' ? 1.4 : 1;
    yaw -= (e.clientX - p.x) * 0.006 * k;
    pitch = clamp(pitch + (e.clientY - p.y) * 0.005 * k, -1.2, 1.45);   // full freedom: from worm's-eye to bird's-eye
  }
  p.x = e.clientX; p.y = e.clientY;
  if (lookers.size === 2) {
    const span = pinchSpan();
    dist = clamp(dist - (span - pinchDist) * 0.05, 3, 40);
    pinchDist = span;
  }
});
function endPointer(e) {
  if (e.pointerId === joy.id) resetStick();
  lookers.delete(e.pointerId);
  if (lookers.size === 2) pinchDist = pinchSpan();
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
addEventListener('wheel', e => { dist = clamp(dist + e.deltaY * 0.01, 3, 40); }, { passive: true });

// on-screen buttons (touch only)
function holdButton(id, onDown, onUp) {
  const b = document.getElementById(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('down'); b.setPointerCapture(e.pointerId); onDown(); });
  const up = () => { b.classList.remove('down'); onUp?.(); };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
}
holdButton('btnJump', () => { touchBtn.jump = true; }, () => { touchBtn.jump = false; });
holdButton('btnMoo', () => { startAudio(); playerMoo(); });
holdButton('btnPpt', () => { stutter = !stutter; drawHud(); });
addEventListener('contextmenu', e => { if (document.body.classList.contains('touch')) e.preventDefault(); });

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {
  overlay.style.opacity = 0; setTimeout(() => overlay.remove(), 800);
  startAudio(); playerMoo();
  setTimeout(() => showCard(currentRegion), 500);
});

const hud = document.getElementById('hud');
function drawHud() {
  const state = `<span class="${stutter ? 'on' : ''}">${stutter ? 'ON' : 'off'}</span>`;
  hud.innerHTML = document.body.classList.contains('touch')
    ? `Left thumb: walk (push far to run) · drag right side: look · pinch: zoom<br>PPT mode (authentic stutter) — ${state}`
    : `WASD walk · Shift run · Space jump · M moo · drag to look · wheel zoom<br>P: PowerPoint mode (authentic stutter) — ${state}`;
  document.getElementById('btnPpt').classList.toggle('on', stutter);
}
if (IS_TOUCH) enableTouchUI(); else drawHud();

const card = document.getElementById('card');
function showCard(text) {
  card.querySelector('span').textContent = text;
  card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
}
function regionAt(x, z) {
  if (Math.hypot(x - VALLEY.x, z - VALLEY.y) < 34) return 'The Hidden Valley';
  if (Math.hypot(x - machine.position.x, z - machine.position.z) < 30) return 'The Machine';
  if (desertF(x, z) > 0.5) return 'The Desert';
  return 'The Grassland';
}
let currentRegion = 'The Grassland';

// ---------- game loop ----------
const vel = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const P = { t: 0, phase: 0, walk: 0, run: 0, air: false, mooing: false };
let heading = 0, vy = 0, onGround = true, airTime = 0, time = 0;
const camTarget = new THREE.Vector3(0, 2.2, 0), camDir = new THREE.Vector3();
let camDist = dist;
const ray = new THREE.Raycaster();
const PLAYER_R = 0.7;
addBody(cow, PLAYER_R, { height: COW_H });

function updatePlayer(dt) {
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joy.y;
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  const running = keys.ShiftLeft || keys.ShiftRight || joy.mag > 0.9;
  const mx = -Math.sin(yaw) * f + Math.cos(yaw) * s, mz = -Math.cos(yaw) * f - Math.sin(yaw) * s;
  let len = Math.hypot(mx, mz);
  if (len < 0.15) len = 0;                                         // joystick dead zone
  const speed = (running ? 13 : 6) * Math.min(1, len);             // analog stick = analog speed
  tmp.set(len ? mx / len * speed : 0, 0, len ? mz / len * speed : 0);
  vel.lerp(tmp, damp(onGround ? 10 : 3, dt));
  if (len) heading = lerpAngle(heading, Math.atan2(mx, mz), damp(12, dt));

  cow.position.x += vel.x * dt;
  cow.position.z += vel.z * dt;
  const support = resolve(cow.position, PLAYER_R, cow.position.y);

  const g = Math.max(groundAt(cow.position.x, cow.position.z), support);
  if ((keys.Space || touchBtn.jump) && onGround) { vy = 11; onGround = false; }
  vy -= 28 * dt;
  cow.position.y += vy * dt;
  if (cow.position.y <= g) { cow.position.y = g; vy = 0; onGround = true; } else if (cow.position.y > g + 0.05) onGround = false;
  airTime = onGround ? 0 : airTime + dt;
  cow.rotation.y = heading;

  const hs = Math.hypot(vel.x, vel.z);
  P.t = time;
  P.walk = THREE.MathUtils.lerp(P.walk, Math.min(1, hs / 5), damp(10, dt));
  P.run = THREE.MathUtils.lerp(P.run, Math.max(0, (hs - 7) / 6), damp(6, dt));
  P.phase += dt * (3 + hs * 1.1);
  P.air = airTime > 0.05;
  mooTimer = Math.max(0, mooTimer - dt);
  P.mooing = mooTimer > 0;
  poseCow(C, P);
}

function updateNPCs(dt) {
  const cp = cow.position;
  // mother turns to watch you and waves when you're near
  {
    const dx = cp.x - mother.cow.position.x, dz = cp.z - mother.cow.position.z, d = Math.hypot(dx, dz);
    motherState.heading = lerpAngle(motherState.heading, Math.atan2(dx, dz), damp(2, dt));
    mother.cow.rotation.y = motherState.heading;
    poseCow(mother, { t: time + 3, phase: 0, walk: 0 });
    if (d < 16) mother.arms[1].rotation.z = 2.4 + Math.sin(time * 7) * 0.4;
  }
  // Bao La follows you like a loyal (large, spotted) dog
  {
    const bp = bao.g.position, d = Math.hypot(cp.x - bp.x, cp.z - bp.z);
    if (d < 45) {
      const tx = cp.x + Math.sin(heading + 2.3) * 3.5, tz = cp.z + Math.cos(heading + 2.3) * 3.5;
      const dt2 = Math.hypot(tx - bp.x, tz - bp.z);
      steer(bao, bao.g, tx, tz, dt2 > 1.2 ? Math.min(16, 2 + dt2 * 2) : 0, dt);
      bao.home.copy(bp);
    } else {
      if ((bao.timer -= dt) < 0) { bao.timer = rr(3, 7); bao.target.set(bao.home.x + rr(-12, 12), 0, bao.home.z + rr(-12, 12)); }
      steer(bao, bao.g, bao.target.x, bao.target.z, 3, dt);
    }
    bao.head.rotation.y = Math.sin(time * 0.8) * 0.4;
    poseQuad(bao, time);
  }
  // wolves circle you — but keep their distance when Bao La is around
  const baoNear = Math.hypot(cp.x - bao.g.position.x, cp.z - bao.g.position.z) < 10;
  wolves.forEach((W, i) => {
    const wp = W.g.position, d = Math.hypot(cp.x - wp.x, cp.z - wp.z);
    const fromDen = Math.hypot(cp.x - WOLF_DEN.x, cp.z - WOLF_DEN.z);
    let tx, tz, sp;
    if (d < 30 && fromDen < 80) {
      if (!W.noticed && i === 0) { W.howl = 2; howl(0.12 * smooth(40, 5, d)); }
      W.noticed = true;
      W.ang += dt * 0.7;
      const R = baoNear ? 18 : 6.5;
      tx = cp.x + Math.cos(W.ang) * R; tz = cp.z + Math.sin(W.ang) * R; sp = baoNear ? 10 : 7.5;
    } else {
      W.noticed = false;
      W.ang += dt * 0.25;
      tx = WOLF_DEN.x + Math.cos(W.ang) * 12; tz = WOLF_DEN.z + Math.sin(W.ang) * 12; sp = 3;
    }
    steer(W, W.g, tx, tz, sp, dt);
    W.howl = Math.max(0, W.howl - dt);
    W.head.rotation.x = W.howl > 0 ? -0.9 : 0;
    poseQuad(W, time + i);
  });
  // the herd grazes and moos
  herd.forEach(h => {
    if ((h.timer -= dt) < 0) {
      h.timer = rr(3, 8);
      const a = rand() * Math.PI * 2, r = rr(2, 22);
      const tx = VALLEY.x + Math.cos(a) * r, tz = VALLEY.y + Math.sin(a) * r;
      if (height(tx, tz) > WATER + 0.4) h.target.set(tx, 0, tz);
      if (rand() < 0.3) {
        h.moo = 1.3;
        const dd = Math.hypot(cp.x - h.C.cow.position.x, cp.z - h.C.cow.position.z);
        if (dd < 45) moo(0.15 * smooth(45, 5, dd), rr(0.7, 1.1));
      }
    }
    h.moo = Math.max(0, h.moo - dt);
    steer(h, h.C.cow, h.target.x, h.target.z, 1.8, dt, 0.9);
    poseCow(h.C, { t: time + h.toff, phase: h.phase, walk: h.walk, mooing: h.moo > 0 });
  });
  // the skylark circles overhead and chirps
  {
    larkState.ang += dt * 1.3;
    tmp.set(cp.x + Math.cos(larkState.ang) * 4, cp.y + 4.5 + Math.sin(time * 2) * 0.6, cp.z + Math.sin(larkState.ang) * 4);
    const prev = tmp2.copy(lark.position);
    larkState.pos.lerp(tmp, damp(3, dt));
    lark.position.copy(larkState.pos);
    tmp.subVectors(lark.position, prev);
    if (tmp.lengthSq() > 1e-6) lark.rotation.y = Math.atan2(tmp.x, tmp.z);
    lark.rotation.z = -0.4;
    lark.userData.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(time * 22) * 0.8; });
    if ((larkState.chirpIn -= dt) < 0) { larkState.chirpIn = rr(6, 14); chirp(0.04); }
  }
}

function updateMachine(dt) {
  const ms = machineState;
  ms.t += dt;
  // lumbers around a loop through the desert edge
  const a = ms.t * 0.035;
  const tx = MACHINE_HOME.x + Math.cos(a) * 30, tz = MACHINE_HOME.y + Math.sin(a * 2) * 18;
  const dx = tx - machine.position.x, dz = tz - machine.position.z;
  if (Math.hypot(dx, dz) > 0.01) ms.heading = lerpAngle(ms.heading, Math.atan2(dx, dz), damp(1.5, dt));
  machine.position.x = tx; machine.position.z = tz;
  machine.position.y = groundAt(tx, tz) + Math.abs(Math.sin(ms.t * 3)) * 0.25;   // clunk clunk
  machine.rotation.y = ms.heading;
  machine.rotation.z = Math.sin(ms.t * 3) * 0.02;
  machineCol.x = tx; machineCol.z = tz; machineCol.rot = ms.heading;
  machineParts.gears.forEach((g, i) => { g.rotation.x = ms.t * (i ? 1.5 : -1.5); });
  machineParts.pistons.forEach((p, i) => { p.position.y = 8 + Math.abs(Math.sin(ms.t * 5 + i * 1.2)) * 1.4; });
  machineParts.arm.rotation.x = Math.sin(ms.t * 0.9) * 0.5 - 0.2;
  machineParts.eyeMat.emissiveIntensity = 0.6 + Math.sin(ms.t * 4) * 0.5;
  machineParts.beacon.emissiveIntensity = Math.sin(ms.t * 8) > 0 ? 1.5 : 0.1;
  machineParts.smoke.forEach((s, i) => {
    const k = (ms.t * 0.5 + i / 8) % 1;
    s.position.set(3.5 + k * 2, 15 + k * 10, -2 - k * 3);
    s.scale.setScalar(0.6 + k * 2.2);
    s.material.opacity = 0.65 * (1 - k);
    s.rotation.set(k * 3, k * 2, 0);
  });
  // its red eye always finds you
  cow.getWorldPosition(tmp); tmp.y += 2;
  machineParts.eye.lookAt(tmp);
  if (hum) {
    const d = Math.hypot(cow.position.x - tx, cow.position.z - tz);
    hum.gain.value = 0.12 * smooth(70, 12, d);
  }
}

function updateCamera(dt) {
  camTarget.lerp(tmp.set(cow.position.x, cow.position.y + 2.2, cow.position.z), damp(14, dt));
  camDir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  // cast a ray from the cow back toward the camera; if something is in the way, slide in in front of it
  ray.set(camTarget, camDir);
  ray.far = dist + 0.5;
  const hit = ray.intersectObjects(blockers, false)[0];
  const want = hit ? Math.max(0.6, hit.distance - 0.5) : dist;
  camDist = want < camDist ? want : THREE.MathUtils.lerp(camDist, want, damp(3, dt)); // snap in, ease out
  camera.position.copy(camTarget).addScaledVector(camDir, camDist);
  // never below the ground: slide up along it so you can still look up at the sky
  const gy = groundAt(camera.position.x, camera.position.z) + 0.4;
  if (camera.position.y < gy) camera.position.y = gy;
  camera.lookAt(camTarget);
  // when the camera is basically inside the cow, hide the cow
  cow.visible = camera.position.distanceTo(camTarget) > 1.3;
}

function update(dt) {
  time += dt;
  updatePlayer(dt);
  updateNPCs(dt);
  updateMachine(dt);
  for (let pass = 0; pass < 3; pass++) {   // a few relaxation passes so crowds pinned against walls settle
    separateBodies();
    for (const b of bodies) {
      const p = b.obj.position;
      if (b.obj === cow) {
        const g = Math.max(groundAt(p.x, p.z), resolve(p, PLAYER_R, p.y));
        if (p.y < g) p.y = g;           // shoved up onto a rock edge
      } else {
        resolve(p, b.r + b.len, -Infinity);
        p.y = groundAt(p.x, p.z);
      }
    }
  }
  animated.forEach(fn => fn(time, dt));
  faceMe.forEach(g => { g.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z); });
  updateCamera(dt);

  sun.position.set(cow.position.x + 30, cow.position.y + 60, cow.position.z + 20);
  sun.target.position.copy(cow.position);

  const reg = regionAt(cow.position.x, cow.position.z);
  if (reg !== currentRegion) { currentRegion = reg; showCard(reg); }

  if (P.mooing) {
    C.head.getWorldPosition(tmp); tmp.y += 1.2; tmp.project(camera);
    mooEl.style.left = (tmp.x * 0.5 + 0.5) * innerWidth + 'px';
    mooEl.style.top = (-tmp.y * 0.5 + 0.5) * innerHeight + 'px';
    mooEl.style.opacity = Math.min(1, mooTimer * 2);
    mooEl.style.transform = `translate(-50%, -100%) rotate(${Math.sin(time * 20) * 6}deg) scale(${1 + (1.3 - mooTimer) * 0.4})`;
  } else mooEl.style.opacity = 0;
}

const clock = new THREE.Clock();
let acc = 0;
renderer.setAnimationLoop(() => {
  const raw = Math.min(clock.getDelta(), 0.2);
  if (stutter) {           // the authentic Niu Lai experience: ~8 fps with the occasional hitch
    acc += raw;
    if (acc < 1 / 8 + (Math.random() < 0.05 ? 0.3 : 0)) return;
    update(Math.min(acc, 0.2)); acc = 0;
  } else update(Math.min(raw, 0.05));
  renderer.render(scene, camera);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.fov = fovFor(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
