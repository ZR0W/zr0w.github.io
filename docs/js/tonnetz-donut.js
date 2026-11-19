// Tonnetz Donut: Euler's Tonnetz (the triangular lattice of triads) wrapped onto a torus.
//
// Lattice: node (i, j) holds pitch class 7i + 3j (mod 12): i steps by perfect fifths around the ring,
// j steps by minor thirds around the tube, and the (1, -1) diagonal is a major third. Each lattice cell
// splits into a minor triad (lower triangle) and a major triad (upper triangle). Fifths repeat after 12
// steps and minor thirds after 4, so a 12 x 4 patch tiles the torus (a 4x cover of the minimal 12-node torus).
//
// Rendering is plain Canvas 2D: a subdivided (u, v) mesh, back-face culling, a painter's sort and cached
// fill colours, redrawn only when something changes. Walk mode puts a character on the surface with a
// third-person camera; each lattice triangle it enters plays its triad through a tiny Web Audio synth.
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  var NI = 12, NJ = 4;          // lattice size: fifths around the ring, minor thirds around the tube
  var S = 4;                    // mesh subdivisions per lattice step
  var GU = NI * S, GV = NJ * S, NV = GU * GV, NF = NV * 2;
  var RR = 2.6, rr = 1.05;      // torus radii
  var NEAR = 0.06;

  function mod(a, n) { return ((a % n) + n) % n; }
  function pitchAt(i, j) { return mod(7 * i + 3 * j, 12); }

  // ---------- music ----------
  // triad id: 0..11 major on root, 12..23 minor on root
  function triadNotes(t) { var k = t % 12; return [k, (k + (t >= 12 ? 3 : 4)) % 12, (k + 7) % 12]; }
  function triadName(t) { return NAMES[t % 12] + (t >= 12 ? 'm' : ''); }
  function plr(t) {
    var k = t % 12;
    if (t < 12) return { P: 12 + k, L: 12 + mod(k + 4, 12), R: 12 + mod(k + 9, 12) };
    return { P: k, L: mod(k + 8, 12), R: mod(k + 3, 12) };
  }

  // lattice triangles: index (i * NJ + j) * 2 + (0 lower / 1 upper)
  var NT = NI * NJ * 2;
  var triTriad = new Int8Array(NT);
  for (var i0 = 0; i0 < NI; i0++) for (var j0 = 0; j0 < NJ; j0++) {
    var b0 = (i0 * NJ + j0) * 2, p0 = pitchAt(i0, j0);
    triTriad[b0] = 12 + p0;              // {p, p+3, p+7}: minor on p
    triTriad[b0 + 1] = mod(p0 + 3, 12);  // {p+3, p+7, p+10}: major on p+3
  }

  // ---------- mesh ----------
  var vU = new Float32Array(NV), vV = new Float32Array(NV);
  var nodeV = [];                       // vertex indices that sit on lattice nodes
  for (var b = 0; b < GV; b++) for (var a = 0; a < GU; a++) {
    var k = b * GU + a;
    vU[k] = a / S; vV[k] = b / S;
    if (a % S === 0 && b % S === 0) nodeV.push(k);
  }
  var NN = nodeV.length;
  var nodePitch = new Int8Array(NN);
  for (var n0 = 0; n0 < NN; n0++) nodePitch[n0] = pitchAt(Math.round(vU[nodeV[n0]]), Math.round(vV[nodeV[n0]]));

  function vi(a, b) { return mod(b, GV) * GU + mod(a, GU); }
  var fA = new Uint16Array(NF), fB = new Uint16Array(NF), fC = new Uint16Array(NF);
  var fTri = new Uint16Array(NF), fEdge = new Uint8Array(NF);
  // lattice edges: id = (i * NJ + j) * 3 + type; 0 fifth (i,j)-(i+1,j), 1 minor third (i,j)-(i,j+1),
  // 2 major third (i,j+1)-(i+1,j). edgeLo/edgeHi are the lower/upper pitch classes of the interval.
  var NE = NI * NJ * 3, SEMIS = [7, 3, 4];
  var edgeLo = new Int8Array(NE), edgeHi = new Int8Array(NE);
  function eid(i, j, type) { return (mod(i, NI) * NJ + mod(j, NJ)) * 3 + type; }
  for (var ie = 0; ie < NI; ie++) for (var je = 0; je < NJ; je++) for (var te = 0; te < 3; te++) {
    var lo = te === 2 ? pitchAt(ie, je + 1) : pitchAt(ie, je), x = eid(ie, je, te);
    edgeLo[x] = lo; edgeHi[x] = (lo + SEMIS[te]) % 12;
  }
  var fEid = new Int16Array(NF * 3).fill(-1); // per face: lattice edge under each of its 3 sides
  (function () {
    var f = 0;
    for (var b = 0; b < GV; b++) for (var a = 0; a < GU; a++) {
      var la = a % S, lb = b % S, cell = ((a / S | 0) * NJ + (b / S | 0)) * 2;
      var v00 = vi(a, b), v10 = vi(a + 1, b), v01 = vi(a, b + 1), v11 = vi(a + 1, b + 1);
      fA[f] = v00; fB[f] = v10; fC[f] = v01;
      fTri[f] = cell + (la + lb + 1 <= S ? 0 : 1);
      fEdge[f] = (lb === 0 ? 1 : 0) | (la + lb + 1 === S ? 2 : 0) | (la === 0 ? 4 : 0);
      var ci = a / S | 0, cj = b / S | 0;
      if (lb === 0) fEid[f * 3] = eid(ci, cj, 0);
      if (la + lb + 1 === S) fEid[f * 3 + 1] = eid(ci, cj, 2);
      if (la === 0) fEid[f * 3 + 2] = eid(ci, cj, 1);
      f++;
      fA[f] = v10; fB[f] = v11; fC[f] = v01;
      fTri[f] = cell + (la + lb + 2 <= S ? 0 : 1);
      fEdge[f] = (la === S - 1 ? 1 : 0) | (lb === S - 1 ? 2 : 0) | (la + lb + 1 === S ? 4 : 0);
      if (la === S - 1) fEid[f * 3] = eid(ci + 1, cj, 1);
      if (lb === S - 1) fEid[f * 3 + 1] = eid(ci, cj + 1, 0);
      if (la + lb + 1 === S) fEid[f * 3 + 2] = eid(ci, cj, 2);
      f++;
    }
  })();
  var bCos = new Float32Array(NV), bSin = new Float32Array(NV), pCos = new Float32Array(NV), pSin = new Float32Array(NV);
  for (var q = 0; q < NV; q++) {
    bCos[q] = Math.cos(TAU * vU[q] / NI); bSin[q] = Math.sin(TAU * vU[q] / NI);
    pCos[q] = Math.cos(TAU * vV[q] / NJ); pSin[q] = Math.sin(TAU * vV[q] / NJ);
  }

  // per-frame buffers (view space + screen)
  var PX = new Float32Array(NV), PY = new Float32Array(NV), PZ = new Float32Array(NV);
  var QX = new Float32Array(NV), QY = new Float32Array(NV), QZ = new Float32Array(NV);
  var SX = new Float32Array(NV), SY = new Float32Array(NV);
  var depth = new Float32Array(NF + NN + 1), shadeOf = new Uint8Array(NF);
  var order = [];

  // ---------- colours ----------
  var baseRGB = [];
  function hsl(h, s, l) {
    h /= 360; var q2 = l < .5 ? l * (1 + s) : l + s - l * s, p2 = 2 * l - q2;
    function c(t) { t = mod(t, 1); return t < 1 / 6 ? p2 + (q2 - p2) * 6 * t : t < .5 ? q2 : t < 2 / 3 ? p2 + (q2 - p2) * (2 / 3 - t) * 6 : p2; }
    return [c(h + 1 / 3) * 255, c(h) * 255, c(h - 1 / 3) * 255];
  }
  for (var t0 = 0; t0 < 24; t0++) {
    var fi = mod((t0 % 12) * 7, 12) / 12; // position on the circle of fifths
    baseRGB.push(t0 < 12 ? hsl(4 + fi * 34, .7, .54) : hsl(168 + fi * 34, .55, .42));
  }
  var LEVELS = 28, colorCache = {};
  function faceColor(triad, state, lev) {
    var key = (triad * 4 + state) * LEVELS + lev, c = colorCache[key];
    if (c) return c;
    var bc = baseRGB[triad], r = bc[0], g = bc[1], bl = bc[2], m;
    if (state === 1) { m = .55; r += (255 - r) * m; g += (226 - g) * m; bl += (150 - bl) * m; }
    else if (state === 2) { m = .22; r += (255 - r) * m; g += (240 - g) * m; bl += (220 - bl) * m; }
    var s = 0.22 + 0.95 * lev / (LEVELS - 1);
    c = 'rgb(' + Math.min(255, r * s | 0) + ',' + Math.min(255, g * s | 0) + ',' + Math.min(255, bl * s | 0) + ')';
    colorCache[key] = c;
    return c;
  }

  // ---------- state ----------
  var canvas, ctx, W = 0, H = 0, DPR = 1;
  var M = [1, 0, 0, 0, 1, 0, 0, 0, 1];  // model rotation (orbit mode)
  var dist = 10, spin = 0, roll = 0;
  var mode = 'orbit', autoRoll = false, sound = true;
  var selected = 0, neighbors = plr(0);
  var dirty = true, anim = null;
  var vel = { a: 0, b: 0 };             // drag inertia (orbit: rotation, skin: spin/roll)
  var drawnFaces = [], drawnNodes = [], drawnEdges = [];
  var selEdge = null;                   // selected interval {lo, hi, type} or null
  // walk
  var me = { x: 0.62, y: 0.62, h: 0, camH: 0, zoom: 1, phase: 0, moving: 0, tri: -1 };
  var cam = null;                       // smoothed walk camera {px,py,pz,ux,uy,uz}
  var joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, look = { id: null, x: 0, y: 0 };
  var keys = {};
  var V = new Float32Array(12);         // view matrix rows (3x3) + translation

  function rotM(ax, ay, az, ang) {
    var c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    var R = [t * ax * ax + c, t * ax * ay - s * az, t * ax * az + s * ay,
             t * ax * ay + s * az, t * ay * ay + c, t * ay * az - s * ax,
             t * ax * az - s * ay, t * ay * az + s * ax, t * az * az + c];
    var o = new Array(9);
    for (var r = 0; r < 3; r++) for (var cI = 0; cI < 3; cI++)
      o[r * 3 + cI] = R[r * 3] * M[cI] + R[r * 3 + 1] * M[3 + cI] + R[r * 3 + 2] * M[6 + cI];
    M = o; orthonormalize();
  }
  function orthonormalize() {
    var x = [M[0], M[1], M[2]], y = [M[3], M[4], M[5]];
    var lx = Math.hypot(x[0], x[1], x[2]); x = x.map(function (v) { return v / lx; });
    var d = x[0] * y[0] + x[1] * y[1] + x[2] * y[2]; y = [y[0] - d * x[0], y[1] - d * x[1], y[2] - d * x[2]];
    var ly = Math.hypot(y[0], y[1], y[2]); y = y.map(function (v) { return v / ly; });
    var z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    M = [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]];
  }
  function resetView() {
    M = [1, 0, 0, 0, 1, 0, 0, 0, 1]; rotM(1, 0, 0, -1.02); dist = 10; spin = 0; roll = 0; vel.a = vel.b = 0; anim = null;
    me.zoom = 1; dirty = true;
  }

  // ---------- surface helpers ----------
  function surf(x, y) { // lattice coords -> world point, normal and tangent frame
    var th = TAU * x / NI + spin, ph = TAU * y / NJ + roll;
    var ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph), w = RR + rr * cp;
    return {
      p: [w * ct, w * st, rr * sp], n: [cp * ct, cp * st, sp],
      tu: [-st, ct, 0], tv: [-sp * ct, -sp * st, cp], w: w
    };
  }
  function triAt(x, y) {
    x = mod(x, NI); y = mod(y, NJ);
    var i = Math.floor(x), j = Math.floor(y);
    return (i * NJ + j) * 2 + ((x - i) + (y - j) >= 1 ? 1 : 0);
  }
  function triCenter(tri) {
    var cell = tri >> 1, i = (cell / NJ) | 0, j = cell % NJ;
    return (tri & 1) ? [i + 2 / 3, j + 2 / 3] : [i + 1 / 3, j + 1 / 3];
  }

  // ---------- camera ----------
  function buildView() {
    if (mode !== 'walk') {
      // camera at (0,0,dist) looking down -z: view = B * M with B = diag(1,1,-1)
      V[0] = M[0]; V[1] = M[1]; V[2] = M[2];
      V[3] = M[3]; V[4] = M[4]; V[5] = M[5];
      V[6] = -M[6]; V[7] = -M[7]; V[8] = -M[8];
      V[9] = 0; V[10] = 0; V[11] = dist;
      return Math.min(W, H) * 0.5 * dist / 3.95;
    }
    var s = surf(me.x, me.y), ch = Math.cos(me.camH), sh = Math.sin(me.camH);
    var F = [ch * s.tu[0] + sh * s.tv[0], ch * s.tu[1] + sh * s.tv[1], ch * s.tu[2] + sh * s.tv[2]];
    var z = me.zoom, up = 2.5 * z, back = 1.5 * z;
    var want = [s.p[0] + s.n[0] * up - F[0] * back, s.p[1] + s.n[1] * up - F[1] * back, s.p[2] + s.n[2] * up - F[2] * back];
    if (!cam) cam = { p: want.slice(), u: s.n.slice() };
    var k = cam.snap ? 1 : 0.18;
    cam.snap = false;
    for (var a = 0; a < 3; a++) { cam.p[a] += (want[a] - cam.p[a]) * k; cam.u[a] += (s.n[a] - cam.u[a]) * k; }
    var tgt = [s.p[0] + F[0] * 0.75, s.p[1] + F[1] * 0.75, s.p[2] + F[2] * 0.75];
    var fw = norm([tgt[0] - cam.p[0], tgt[1] - cam.p[1], tgt[2] - cam.p[2]]);
    var rt = norm(cross(fw, cam.u)), uu = cross(rt, fw);
    V[0] = rt[0]; V[1] = rt[1]; V[2] = rt[2];
    V[3] = uu[0]; V[4] = uu[1]; V[5] = uu[2];
    V[6] = fw[0]; V[7] = fw[1]; V[8] = fw[2];
    V[9] = -dot(rt, cam.p); V[10] = -dot(uu, cam.p); V[11] = -dot(fw, cam.p);
    return H * 0.5 + W * 0.15;
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function toView(p) {
    return [V[0] * p[0] + V[1] * p[1] + V[2] * p[2] + V[9], V[3] * p[0] + V[4] * p[1] + V[5] * p[2] + V[10], V[6] * p[0] + V[7] * p[1] + V[8] * p[2] + V[11]];
  }

  // ---------- render ----------
  var LX = -0.42, LY = 0.62, LZ = -0.66; // light direction (towards the light), view space
  var focal = 1, cxs = 0, cys = 0;
  function render() {
    focal = buildView();
    cxs = W / 2; cys = mode === 'walk' ? H * 0.42 : H * 0.43;
    var cs = Math.cos(spin), ss = Math.sin(spin), cr = Math.cos(roll), sr = Math.sin(roll);
    var v0 = V[0], v1 = V[1], v2 = V[2], v3 = V[3], v4 = V[4], v5 = V[5], v6 = V[6], v7 = V[7], v8 = V[8];
    var k;
    for (k = 0; k < NV; k++) {
      var ct = bCos[k] * cs - bSin[k] * ss, st = bSin[k] * cs + bCos[k] * ss;
      var cp = pCos[k] * cr - pSin[k] * sr, sp = pSin[k] * cr + pCos[k] * sr;
      var w = RR + rr * cp, x = w * ct, y = w * st, z = rr * sp;
      var nx = cp * ct, ny = cp * st, nz = sp;
      var vx = v0 * x + v1 * y + v2 * z + V[9], vy = v3 * x + v4 * y + v5 * z + V[10], vz = v6 * x + v7 * y + v8 * z + V[11];
      PX[k] = vx; PY[k] = vy; PZ[k] = vz;
      QX[k] = v0 * nx + v1 * ny + v2 * nz; QY[k] = v3 * nx + v4 * ny + v5 * nz; QZ[k] = v6 * nx + v7 * ny + v8 * nz;
      if (vz > NEAR) { SX[k] = cxs + focal * vx / vz; SY[k] = cys - focal * vy / vz; }
    }
    order.length = 0;
    var walk = mode === 'walk';
    for (k = 0; k < NF; k++) {
      var a = fA[k], b = fB[k], c = fC[k];
      if (PZ[a] < NEAR || PZ[b] < NEAR || PZ[c] < NEAR) continue;
      var mx = PX[a] + PX[b] + PX[c], my = PY[a] + PY[b] + PY[c], mz = PZ[a] + PZ[b] + PZ[c];
      var nx2 = QX[a] + QX[b] + QX[c], ny2 = QY[a] + QY[b] + QY[c], nz2 = QZ[a] + QZ[b] + QZ[c];
      if (nx2 * mx + ny2 * my + nz2 * mz >= 0) continue; // back face
      var nl = Math.hypot(nx2, ny2, nz2);
      var lam = (nx2 * LX + ny2 * LY + nz2 * LZ) / nl;
      lam = 0.3 + 0.7 * (lam > 0 ? lam : 0);
      if (walk) { var fog = 1.25 - mz / 3 * 0.075; lam *= fog < 0.35 ? 0.35 : fog > 1 ? 1 : fog; }
      shadeOf[k] = Math.min(LEVELS - 1, Math.round(lam * (LEVELS - 1)));
      depth[k] = mz / 3;
      order.push(k);
    }
    for (k = 0; k < NN; k++) {
      var vk = nodeV[k];
      if (PZ[vk] < NEAR + 0.1) continue;
      if (QX[vk] * PX[vk] + QY[vk] * PY[vk] + QZ[vk] * PZ[vk] >= -0.02 * PZ[vk]) continue;
      depth[NF + k] = PZ[vk] - 0.12;
      order.push(NF + k);
    }
    var hero = null;
    if (walk) {
      hero = heroPose();
      if (hero) { depth[NF + NN] = hero.depth; order.push(NF + NN); }
    }
    order.sort(byDepth);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineJoin = 'round';
    drawnFaces.length = 0; drawnNodes.length = 0; drawnEdges.length = 0;
    var seq = 0;
    var lineCol = 'rgba(255,243,226,0.55)', lw = walk ? 1.4 : 1.1;
    var noteOn = activeNotes();
    for (var o = 0; o < order.length; o++) {
      var it = order[o];
      if (it < NF) {
        var A = fA[it], B = fB[it], C = fC[it], tri = fTri[it], td = triTriad[tri];
        var state = td === selected ? 1 : (td === neighbors.P || td === neighbors.L || td === neighbors.R) ? 2 : 0;
        var col = faceColor(td, state, shadeOf[it]);
        ctx.beginPath(); ctx.moveTo(SX[A], SY[A]); ctx.lineTo(SX[B], SY[B]); ctx.lineTo(SX[C], SY[C]); ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 0.8; ctx.stroke(); // hides AA seams
        seq++;
        drawnFaces.push(it, seq);
        if (fEdge[it]) {
          ctx.beginPath();
          var hl = null;
          for (var s3 = 0; s3 < 3; s3++) {
            var ed = fEid[it * 3 + s3]; if (ed < 0) continue;
            var p1 = s3 === 0 ? A : s3 === 1 ? B : C, p2 = s3 === 0 ? B : s3 === 1 ? C : A;
            ctx.moveTo(SX[p1], SY[p1]); ctx.lineTo(SX[p2], SY[p2]);
            drawnEdges.push(ed, SX[p1], SY[p1], SX[p2], SY[p2], seq);
            if (selEdge && edgeLo[ed] === selEdge.lo && edgeHi[ed] === selEdge.hi) (hl || (hl = [])).push(p1, p2);
          }
          ctx.strokeStyle = lineCol; ctx.lineWidth = lw; ctx.stroke();
          if (hl) {
            ctx.beginPath();
            for (var h2 = 0; h2 < hl.length; h2 += 2) { ctx.moveTo(SX[hl[h2]], SY[hl[h2]]); ctx.lineTo(SX[hl[h2 + 1]], SY[hl[h2 + 1]]); }
            ctx.lineCap = 'round'; ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = walk ? 5 : 4; ctx.stroke(); ctx.lineCap = 'butt';
          }
        }
      } else if (it < NF + NN) {
        var ni = it - NF, vv = nodeV[ni], pz = PZ[vv];
        var rad = Math.max(6, Math.min(walk ? 20 : 14, focal * 0.2 / pz));
        var pc = nodePitch[ni], on = noteOn[pc];
        ctx.beginPath(); ctx.arc(SX[vv], SY[vv], rad, 0, TAU);
        ctx.fillStyle = on ? '#ffd27a' : '#f4e8d6'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = on ? '#fff3c4' : 'rgba(40,24,14,.55)'; ctx.stroke();
        if (rad >= 7) {
          ctx.fillStyle = '#2a170c';
          ctx.font = '700 ' + Math.round(rad * 0.95) + 'px system-ui,sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(NAMES[pc], SX[vv], SY[vv] + 0.5);
        }
        drawnNodes.push(ni, SX[vv], SY[vv], rad);
      } else if (hero) {
        drawHero(hero);
      }
    }
  }
  function byDepth(a, b) { return depth[b] - depth[a]; }

  // ---------- walking character ----------
  function heroPose() {
    var s = surf(me.x, me.y), ch = Math.cos(me.h), sh = Math.sin(me.h);
    var F = [ch * s.tu[0] + sh * s.tv[0], ch * s.tu[1] + sh * s.tv[1], ch * s.tu[2] + sh * s.tv[2]];
    var Rg = cross(F, s.n);
    var K = HERO, bob = Math.abs(Math.sin(me.phase)) * 0.05 * me.moving, swing = Math.sin(me.phase) * 0.11 * K * me.moving;
    function at(u, f, rgt) { return [s.p[0] + s.n[0] * u + F[0] * f + Rg[0] * rgt, s.p[1] + s.n[1] * u + F[1] * f + Rg[1] * rgt, s.p[2] + s.n[2] * u + F[2] * f + Rg[2] * rgt]; }
    var pts = {
      base: at(0.01, 0, 0), footL: at(0.02, swing, -0.08 * K), footR: at(0.02, -swing, 0.08 * K),
      hip: at((0.22 + bob) * K, 0, 0), neck: at((0.46 + bob) * K, 0, 0), head: at((0.6 + bob) * K, 0, 0), nose: at((0.6 + bob) * K, 0.1 * K, 0),
      handL: at((0.3 + bob) * K, -swing, -0.15 * K), handR: at((0.3 + bob) * K, swing, 0.15 * K), shoulder: at((0.42 + bob) * K, 0, 0)
    };
    var out = {};
    for (var key in pts) {
      var v = toView(pts[key]);
      if (v[2] < NEAR) return null;
      out[key] = [cxs + focal * v[0] / v[2], cys - focal * v[1] / v[2], focal / v[2]];
    }
    out.depth = toView(pts.hip)[2] - 0.25;
    return out;
  }
  var HERO = 0.9;
  function drawHero(h) {
    var sc = h.hip[2] * HERO;
    ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(h.base[0], h.base[1], 0.2 * sc, 0.09 * sc, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a170c'; ctx.lineWidth = 0.07 * sc;
    ctx.beginPath(); ctx.moveTo(h.hip[0], h.hip[1]); ctx.lineTo(h.footL[0], h.footL[1]); ctx.moveTo(h.hip[0], h.hip[1]); ctx.lineTo(h.footR[0], h.footR[1]); ctx.stroke();
    ctx.lineWidth = 0.055 * sc;
    ctx.beginPath(); ctx.moveTo(h.shoulder[0], h.shoulder[1]); ctx.lineTo(h.handL[0], h.handL[1]); ctx.moveTo(h.shoulder[0], h.shoulder[1]); ctx.lineTo(h.handR[0], h.handR[1]); ctx.stroke();
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 0.17 * sc;
    ctx.beginPath(); ctx.moveTo(h.hip[0], h.hip[1]); ctx.lineTo(h.neck[0], h.neck[1]); ctx.stroke();
    ctx.fillStyle = '#f6e7d2'; ctx.strokeStyle = '#2a170c'; ctx.lineWidth = Math.max(1, 0.02 * sc);
    ctx.beginPath(); ctx.arc(h.head[0], h.head[1], 0.1 * sc, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a170c';
    ctx.beginPath(); ctx.arc(h.nose[0], h.nose[1], 0.025 * sc, 0, TAU); ctx.fill();
    ctx.lineCap = 'butt';
  }

  // ---------- audio ----------
  var AC = null, master = null, voices = [], center = 60;
  function audio() {
    if (AC) { if (AC.state === 'suspended') AC.resume(); return AC; }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    AC = new Ctor();
    var comp = AC.createDynamicsCompressor(); comp.connect(AC.destination);
    var lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(comp);
    master = AC.createGain(); master.gain.value = 0.22; master.connect(lp);
    var dl = AC.createDelay(); dl.delayTime.value = 0.23;
    var fb = AC.createGain(); fb.gain.value = 0.28;
    var wet = AC.createGain(); wet.gain.value = 0.22;
    master.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(lp);
    return AC;
  }
  function playMidi(m, vel2, when) {
    var ac = audio(); if (!ac || !sound) return;
    var t = ac.currentTime + (when || 0), f = 440 * Math.pow(2, (m - 69) / 12);
    var g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(vel2 * 0.35, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    g.connect(master);
    var o1 = ac.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f; o1.connect(g);
    var g2 = ac.createGain(); g2.gain.value = 0.25; g2.connect(g);
    var o2 = ac.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.002; o2.connect(g2);
    o1.start(t); o2.start(t); o1.stop(t + 1.7); o2.stop(t + 1.7);
    voices.push(o1);
    if (voices.length > 24) { try { voices.shift().stop(); } catch (e) { /* already stopped */ } }
    lightKey(m, (when || 0) * 1000);
  }
  function nearest(pc) { var m = pc + 12 * Math.round((center - pc) / 12); return Math.max(48, Math.min(71, m)); }
  function playTriad(t, arp) {
    var ns = triadNotes(t), sum = 0;
    for (var i = 0; i < 3; i++) { var m = nearest(ns[i]); sum += m; playMidi(m, 0.5, arp ? i * 0.045 : 0); }
    center = sum / 3 * 0.8 + 60 * 0.2; // smooth voice leading, gently pulled back to middle C
  }
  function playNote(pc) { playMidi(nearest(pc), 0.6, 0); }
  function playInterval(lo, semis) {
    var m = nearest(lo); if (m + semis > 71) m -= 12;
    playMidi(m, 0.55, 0); playMidi(m + semis, 0.55, 0.22);
    playMidi(m, 0.4, 0.6); playMidi(m + semis, 0.4, 0.6);
    center = m + semis / 2;
  }

  // ---------- piano ----------
  var keyEls = {}, keyTimers = {};
  function buildPiano() {
    var el = document.getElementById('piano'), whites = 0, blackPos = [1, 3, 6, 8, 10];
    for (var m = 48; m < 72; m++) if (blackPos.indexOf(m % 12) < 0) whites++;
    var wi = 0;
    for (m = 48; m < 72; m++) {
      var d = document.createElement('div');
      if (blackPos.indexOf(m % 12) < 0) { d.className = 'w'; wi++; }
      else { d.className = 'k'; d.style.left = (wi / whites * 100 - 1.9) + '%'; d.style.width = '3.8%'; }
      el.appendChild(d); keyEls[m] = d;
    }
  }
  function lightKey(m, delay) {
    var el = keyEls[m]; if (!el) return;
    setTimeout(function () {
      el.classList.add('on'); clearTimeout(keyTimers[m]);
      keyTimers[m] = setTimeout(function () { el.classList.remove('on'); }, 700);
    }, delay);
  }

  // ---------- selection / UI ----------
  var activeCache = null;
  function activeNotes() {
    if (activeCache) return activeCache;
    var a = {}, ns = selEdge ? [selEdge.lo, selEdge.hi] : triadNotes(selected);
    for (var i = 0; i < ns.length; i++) a[ns[i]] = true;
    return (activeCache = a);
  }
  function select(t, play) {
    selected = t; neighbors = plr(t); selEdge = null; activeCache = null; dirty = true;
    var ns = triadNotes(t);
    document.getElementById('cName').textContent = triadName(t);
    document.getElementById('cNotes').textContent = ns.map(function (n) { return NAMES[n]; }).join(' · ') + ' · ' + (t < 12 ? 'major' : 'minor');
    var box = document.getElementById('plr'); box.textContent = '';
    ['P', 'L', 'R'].forEach(function (op) {
      var btn = document.createElement('button'), to = neighbors[op];
      btn.innerHTML = '<i>' + op + '</i>' + triadName(to);
      btn.title = { P: 'Parallel: keep root and fifth, move the third', L: 'Leading-tone exchange', R: 'Relative major/minor' }[op];
      btn.addEventListener('click', function () { select(to, true); if (mode === 'walk') hopTo(to); });
      box.appendChild(btn);
    });
    if (play) playTriad(t, true);
  }
  var INTERVAL_NAMES = ['perfect fifth', 'minor third', 'major third'];
  function triadsWith(lo, hi) {
    var out = [];
    for (var t = 0; t < 24; t++) { var ns = triadNotes(t); if (ns.indexOf(lo) >= 0 && ns.indexOf(hi) >= 0) out.push(t); }
    return out;
  }
  function selectInterval(ed, play) {
    var type = ed % 3, lo = edgeLo[ed], hi = edgeHi[ed], both = triadsWith(lo, hi);
    selEdge = { lo: lo, hi: hi, type: type };
    selected = -1; neighbors = { P: both[0], L: both[1], R: -1 }; activeCache = null; dirty = true;
    document.getElementById('cName').textContent = NAMES[lo] + '–' + NAMES[hi];
    document.getElementById('cNotes').textContent = INTERVAL_NAMES[type] + ' · ' + SEMIS[type] + ' semitones';
    var box = document.getElementById('plr'); box.textContent = '';
    both.forEach(function (t) {
      var btn = document.createElement('button');
      btn.innerHTML = '<i>△</i>' + triadName(t);
      btn.title = 'A chord that contains this interval (the triangle on that side of the edge)';
      btn.addEventListener('click', function () { select(t, true); if (mode === 'walk') hopTo(t); });
      box.appendChild(btn);
    });
    if (play) playInterval(lo, SEMIS[type]);
  }
  function hopTo(t) { // in walk mode, move to the nearest copy of triad t
    var best = -1, bd = 1e9;
    for (var tri = 0; tri < NT; tri++) if (triTriad[tri] === t) {
      var c = triCenter(tri), dx = mod(c[0] - me.x + NI / 2, NI) - NI / 2, dy = mod(c[1] - me.y + NJ / 2, NJ) - NJ / 2, d = dx * dx + dy * dy * 4;
      if (d < bd) { bd = d; best = tri; }
    }
    var cc = triCenter(best); me.x = cc[0]; me.y = cc[1]; me.tri = best; dirty = true;
  }
  function setMode(m) {
    if (mode === m) return;
    var prev = mode; mode = m; vel.a = vel.b = 0; dirty = true;
    document.getElementById('mOrbit').classList.toggle('on', m === 'orbit');
    document.getElementById('mSkin').classList.toggle('on', m === 'skin');
    document.getElementById('mWalk').classList.toggle('on', m === 'walk');
    document.body.classList.toggle('walk', m === 'walk');
    var hint = document.getElementById('hint');
    if (m === 'walk') {
      autoRoll = false; anim = null; document.getElementById('autoBtn').classList.remove('on');
      hopTo(selected); me.camH = me.h; cam = null;
      hint.textContent = 'Walk the lattice: each tile sounds its chord';
      audio();
    } else {
      hint.textContent = m === 'skin' ? 'Drag ↔ slides the skin round the ring · drag ↕ rolls it through the hole' : 'Drag to spin · pinch to zoom · tap a dot, edge or triangle to play';
      if (prev === 'walk') { joy.id = look.id = null; showJoy(false); }
    }
  }

  // ---------- input ----------
  var ptrs = {}, gesture = null, lastTap = 0, downInfo = null;
  function onDown(e) {
    audio();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    vel.a = vel.b = 0;
    if (mode === 'walk') {
      if (e.clientX < W * 0.5 && joy.id === null) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; showJoy(true); }
      else if (look.id === null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; }
      return;
    }
    var ids = Object.keys(ptrs);
    if (ids.length === 1) { downInfo = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; canvas.classList.add('dragging'); }
    else { downInfo = null; gesture = twoInfo(); }
  }
  function twoInfo() {
    var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  function onMove(e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (mode === 'walk') {
      if (e.pointerId === joy.id) {
        var jx = e.clientX - joy.ox, jy = e.clientY - joy.oy, l = Math.hypot(jx, jy), mx = 50;
        if (l > mx) { jx *= mx / l; jy *= mx / l; }
        joy.x = jx / mx; joy.y = jy / mx;
        document.querySelector('#joy i').style.transform = 'translate(' + jx + 'px,' + jy + 'px)';
      } else if (e.pointerId === look.id) {
        me.camH -= dx * 0.008;
        me.zoom = Math.max(0.55, Math.min(2.2, me.zoom * (1 + dy * 0.004)));
        dirty = true;
      }
      return;
    }
    var ids = Object.keys(ptrs);
    if (ids.length >= 2 && gesture) {
      var g = twoInfo();
      dist = Math.max(5.5, Math.min(22, dist * gesture.d / (g.d || 1)));
      var da = g.ang - gesture.ang; if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU;
      rotM(0, 0, 1, -da);
      if (mode === 'skin') { roll += (g.my - gesture.my) * 0.006; spin += (g.mx - gesture.mx) * 0.006; }
      gesture = g; dirty = true;
      return;
    }
    if (mode === 'orbit') {
      var k = 0.0085;
      if (dx) rotM(0, 1, 0, dx * k);
      if (dy) rotM(1, 0, 0, dy * k);
      vel.a = dx * k; vel.b = dy * k;
    } else {
      spin -= dx * 0.008; roll -= dy * 0.008;
      vel.a = -dx * 0.008; vel.b = -dy * 0.008;
    }
    dirty = true;
  }
  function onUp(e) {
    var p = ptrs[e.pointerId];
    delete ptrs[e.pointerId];
    if (mode === 'walk') {
      if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; showJoy(false); }
      if (e.pointerId === look.id) look.id = null;
      return;
    }
    if (Object.keys(ptrs).length < 2) gesture = null;
    if (!Object.keys(ptrs).length) canvas.classList.remove('dragging');
    if (downInfo && downInfo.id === e.pointerId && p) {
      var moved = Math.hypot(p.x - downInfo.x, p.y - downInfo.y), dt = performance.now() - downInfo.t;
      if (moved < 8 && dt < 350) {
        vel.a = vel.b = 0;
        var now = performance.now();
        if (now - lastTap < 300) { flip(); lastTap = 0; } else { lastTap = now; tap(p.x, p.y); }
      }
    }
    downInfo = null;
  }
  function showJoy(on) {
    var j = document.getElementById('joy');
    j.style.display = on ? 'block' : 'none';
    j.style.left = joy.ox + 'px'; j.style.top = joy.oy + 'px';
    j.querySelector('i').style.transform = '';
  }
  function tap(x, y) {
    for (var n = drawnNodes.length - 4; n >= 0; n -= 4) {
      if (Math.hypot(x - drawnNodes[n + 1], y - drawnNodes[n + 2]) <= drawnNodes[n + 3] + 3) { playNote(nodePitch[drawnNodes[n]]); return; }
    }
    var face = -1, faceSeq = -1;
    for (var i = drawnFaces.length - 2; i >= 0; i -= 2) {
      var f = drawnFaces[i];
      if (inTri(x, y, SX[fA[f]], SY[fA[f]], SX[fB[f]], SY[fB[f]], SX[fC[f]], SY[fC[f]])) { face = f; faceSeq = drawnFaces[i + 1]; break; }
    }
    // an edge wins if it lies within a finger's reach and isn't hidden behind the face being touched
    var tol = 11, best = -1, bestSeq = -1, bestD = tol;
    for (var e = 0; e < drawnEdges.length; e += 6) {
      var es = drawnEdges[e + 5]; if (es < faceSeq) continue;
      var d = segDist(x, y, drawnEdges[e + 1], drawnEdges[e + 2], drawnEdges[e + 3], drawnEdges[e + 4]);
      if (d < tol && (es > bestSeq || (es === bestSeq && d < bestD))) { best = drawnEdges[e]; bestSeq = es; bestD = d; }
    }
    if (best >= 0) { selectInterval(best, true); return; }
    if (face >= 0) select(triTriad[fTri[face]], true);
  }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function inTri(px, py, ax, ay, bx, by, cx, cy) {
    var d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by), d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy), d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  }
  function flip() { animate('roll', roll, roll + Math.PI, 900); }
  function turnOver() { animate('over', 0, Math.PI, 900); }
  function animate(key, from, to, dur) { anim = { key: key, from: from, to: to, last: from, t0: performance.now(), dur: dur }; vel.a = vel.b = 0; }

  // ---------- loop ----------
  var lastT = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (anim) {
      var u = Math.min(1, (now - anim.t0) / anim.dur), e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      var v = anim.from + (anim.to - anim.from) * e;
      if (anim.key === 'roll') roll = v; else rotM(1, 0, 0, v - anim.last);
      anim.last = v; dirty = true;
      if (u >= 1) anim = null;
    }
    if (mode !== 'walk') {
      if (autoRoll) { roll += dt * 0.45; spin += dt * 0.12; dirty = true; }
      if (!Object.keys(ptrs).length && (Math.abs(vel.a) > 1e-4 || Math.abs(vel.b) > 1e-4)) {
        if (mode === 'orbit') { rotM(0, 1, 0, vel.a); rotM(1, 0, 0, vel.b); } else { spin += vel.a; roll += vel.b; }
        var damp = Math.pow(0.05, dt); vel.a *= damp; vel.b *= damp; dirty = true;
      }
    } else stepWalk(dt);
    if (dirty) { dirty = false; render(); }
    requestAnimationFrame(frame);
  }
  function stepWalk(dt) {
    var jx = joy.x, jy = joy.y;
    if (keys.w || keys.arrowup) jy -= 1;
    if (keys.s || keys.arrowdown) jy += 1;
    if (keys.a || keys.arrowleft) jx -= 1;
    if (keys.d || keys.arrowright) jx += 1;
    if (keys.q) { me.camH += dt * 1.8; dirty = true; }
    if (keys.e) { me.camH -= dt * 1.8; dirty = true; }
    var m = Math.min(1, Math.hypot(jx, jy));
    if (m > 0.08) {
      var dir = me.camH - Math.atan2(jx, -jy);
      me.h += angDiff(dir, me.h) * Math.min(1, dt * 12);
      var ad = angDiff(me.h, me.camH);
      if (Math.abs(ad) < 1.9) me.camH += ad * Math.min(1, dt * 1.6 * m);
      var s = surf(me.x, me.y), sp = 2.1 * m * dt;
      me.x = mod(me.x + Math.cos(me.h) * sp / s.w * NI / TAU, NI);
      me.y = mod(me.y + Math.sin(me.h) * sp / rr * NJ / TAU, NJ);
      me.phase += dt * 11 * m; me.moving = Math.min(1, me.moving + dt * 6);
      dirty = true;
    } else if (me.moving > 0) { me.moving = Math.max(0, me.moving - dt * 5); dirty = true; }
    if (cam) dirty = true; // camera easing
    var tri = triAt(me.x, me.y);
    if (tri !== me.tri) { me.tri = tri; select(triTriad[tri], true); }
  }
  function angDiff(a, b) { return mod(a - b + Math.PI, TAU) - Math.PI; }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    dirty = true;
  }

  function init() {
    canvas = document.getElementById('stage'); ctx = canvas.getContext('2d');
    buildPiano(); resize(); resetView(); select(0, false);
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (mode === 'walk') me.zoom = Math.max(0.6, Math.min(2.4, me.zoom * Math.exp(e.deltaY * 0.001)));
      else dist = Math.max(5.5, Math.min(22, dist * Math.exp(e.deltaY * 0.001)));
      dirty = true;
    }, { passive: false });
    document.getElementById('mOrbit').onclick = function () { setMode('orbit'); };
    document.getElementById('mSkin').onclick = function () { setMode('skin'); };
    document.getElementById('mWalk').onclick = function () { setMode('walk'); };
    document.getElementById('flipBtn').onclick = flip;
    document.getElementById('overBtn').onclick = turnOver;
    document.getElementById('autoBtn').onclick = function () { autoRoll = !autoRoll; this.classList.toggle('on', autoRoll); };
    document.getElementById('soundBtn').onclick = function () { sound = !sound; this.classList.toggle('on', sound); if (sound) audio(); };
    document.getElementById('resetBtn').onclick = function () { if (mode === 'walk') { me.zoom = 1; me.camH = me.h; cam = null; dirty = true; } else resetView(); };
    var help = document.getElementById('help');
    document.getElementById('helpBtn').onclick = function () { help.classList.add('show'); };
    document.getElementById('helpClose').onclick = function () { help.classList.remove('show'); };
    help.addEventListener('click', function (e) { if (e.target === help) help.classList.remove('show'); });
    window.addEventListener('keydown', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      var k = e.key.toLowerCase(); keys[k] = true;
      if (k === 'escape') { help.classList.remove('show'); if (mode === 'walk') setMode('orbit'); }
      if (k === 'f' && mode !== 'walk') flip();
      if (k.indexOf('arrow') === 0 || k === ' ') e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', function () { keys = {}; });
    requestAnimationFrame(frame);
    window.TonnetzDonut = { render: render }; // handle for tests
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
