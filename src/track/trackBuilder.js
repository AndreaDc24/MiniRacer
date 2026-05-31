import * as THREE from 'three';

// ─── Catmull-Rom spline ──────────────────────────────────────────────────────

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
  ];
}

function catmullRomTangent(p0, p1, p2, p3, t) {
  const t2 = t * t;
  return [
    0.5 * ((-p0[0]+p2[0]) + 2*(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t + 3*(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t2),
    0.5 * ((-p0[1]+p2[1]) + 2*(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t + 3*(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t2),
  ];
}

// Build dense polyline from control points (closed curve)
function buildSplinePolyline(ctrl, samplesPerSegment = 40) {
  const n = ctrl.length;
  const pts = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    for (let j = 0; j < samplesPerSegment; j++) {
      pts.push(catmullRomPoint(p0, p1, p2, p3, j / samplesPerSegment));
    }
  }
  return pts;
}

function buildSplineTangents(ctrl, samplesPerSegment = 40) {
  const n = ctrl.length;
  const tans = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    for (let j = 0; j < samplesPerSegment; j++) {
      tans.push(catmullRomTangent(p0, p1, p2, p3, j / samplesPerSegment));
    }
  }
  return tans;
}

// Cumulative arc-length table
function arcLengthTable(pts) {
  const table = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0];
    const dz = pts[i][1] - pts[i-1][1];
    table.push(table[i-1] + Math.sqrt(dx*dx + dz*dz));
  }
  return table;
}

// Resample to N evenly spaced points (by arc length)
function resampleEven(pts, N) {
  const arcTable = arcLengthTable(pts);
  const totalLen = arcTable[arcTable.length - 1];
  const result = [];
  for (let k = 0; k < N; k++) {
    const targetLen = (k / N) * totalLen;
    // Binary search
    let lo = 0, hi = arcTable.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arcTable[mid] <= targetLen) lo = mid; else hi = mid;
    }
    const t = (targetLen - arcTable[lo]) / (arcTable[hi] - arcTable[lo] + 1e-12);
    result.push([
      pts[lo][0] + t * (pts[hi][0] - pts[lo][0]),
      pts[lo][1] + t * (pts[hi][1] - pts[lo][1]),
    ]);
  }
  return result;
}

// ─── Track build ────────────────────────────────────────────────────────────

const TRACK_SAMPLES = 800;   // number of centerline points in final centerline
const GRASS_HALF    = 40;    // grass extends this far either side of track edge (m)

let _centerline   = null;    // [[x,z], ...] evenly spaced
let _arcTable     = null;    // cumulative arc lengths
let _totalLength  = 0;
let _tangents     = null;    // normalized tangent at each point

export function buildTrack(scene, monza) {
  const ctrl = monza.controlPoints;

  // 1. Build dense spline and resample
  const raw = buildSplinePolyline(ctrl, 60);
  const even = resampleEven(raw, TRACK_SAMPLES);

  // 2. Scale to target length
  const arcRaw = arcLengthTable(even);
  const rawLen = arcRaw[arcRaw.length - 1];
  const scale  = monza.length_m / rawLen;
  const centerline = even.map(([x, z]) => [x * scale, z * scale]);

  // Cache for runtime queries
  _centerline  = centerline;
  _arcTable    = arcLengthTable(centerline);
  _totalLength = _arcTable[_arcTable.length - 1];
  _tangents    = computeTangents(centerline);

  const hw = monza.trackWidth / 2;

  // 3. Asphalt ribbon (custom geometry — two triangles per segment)
  scene.add(buildRibbon(centerline, hw, 0x2a2a2a));

  // 4. Grass / runoff
  scene.add(buildGrassPlane(centerline, hw + GRASS_HALF));

  // 5. White edge lines
  scene.add(buildEdgeLine(centerline,  hw - 0.4, 0xffffff));
  scene.add(buildEdgeLine(centerline, -(hw - 0.4), 0xffffff));

  // 6. Curbs
  monza.curbs.forEach(c => buildCurb(scene, c, hw));

  // 7. Sector markers
  monza.sectorSplits.forEach(s => buildSectorMarker(scene, s));

  // 8. Start / finish
  buildStartFinish(scene);

  return { centerline, totalLength: _totalLength };
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

function computeTangents(cl) {
  const n = cl.length;
  return cl.map((_, i) => {
    const prev = cl[(i - 1 + n) % n];
    const next = cl[(i + 1) % n];
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.sqrt(dx*dx + dz*dz) + 1e-12;
    return [dx/len, dz/len];
  });
}

function buildRibbon(cl, hw, color) {
  const n = cl.length;
  const positions = new Float32Array(n * 4 * 3);
  const indices   = [];
  let vi = 0;

  for (let i = 0; i < n; i++) {
    const [x, z] = cl[i];
    const [tx, tz] = _tangents[i];
    const nx = -tz, nz = tx;  // left normal

    // left outer, left inner, right inner, right outer (but we just do left/right)
    positions[vi*3+0] =  x + nx*hw; positions[vi*3+1] = 0; positions[vi*3+2] =  z + nz*hw; vi++;
    positions[vi*3+0] =  x - nx*hw; positions[vi*3+1] = 0; positions[vi*3+2] =  z - nz*hw; vi++;
  }

  for (let i = 0; i < n; i++) {
    const a = i*2, b = i*2+1;
    const c = ((i+1)%n)*2, d = ((i+1)%n)*2+1;
    indices.push(a, b, c,  b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 }));
}

function buildGrassPlane(cl, halfWidth) {
  const n = cl.length;
  const positions = new Float32Array(n * 4 * 3);
  const indices   = [];
  let vi = 0;

  for (let i = 0; i < n; i++) {
    const [x, z] = cl[i];
    const [tx, tz] = _tangents[i];
    const nx = -tz, nz = tx;
    const y = -0.05;  // slightly below asphalt to avoid z-fighting

    positions[vi*3+0] = x + nx*halfWidth; positions[vi*3+1] = y; positions[vi*3+2] = z + nz*halfWidth; vi++;
    positions[vi*3+0] = x - nx*halfWidth; positions[vi*3+1] = y; positions[vi*3+2] = z - nz*halfWidth; vi++;
  }

  for (let i = 0; i < n; i++) {
    const a = i*2, b = i*2+1;
    const c = ((i+1)%n)*2, d = ((i+1)%n)*2+1;
    indices.push(a, b, c,  b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2d6a2d, roughness: 1 }));
}

function buildEdgeLine(cl, offset, color) {
  const n = cl.length;
  const pts3 = [];
  for (let i = 0; i <= n; i++) {
    const [x, z] = cl[i % n];
    const [tx, tz] = _tangents[i % n];
    const nx = -tz, nz = tx;
    pts3.push(new THREE.Vector3(x + nx*offset, 0.02, z + nz*offset));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts3);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
}

function buildCurb(scene, curbDef, hw) {
  const { progressStart, progressEnd, side } = curbDef;
  const iStart = Math.floor(progressStart * TRACK_SAMPLES);
  const iEnd   = Math.floor(progressEnd   * TRACK_SAMPLES);
  const STRIP_W = 0.8;  // curd strip width
  const STRIP_L = 0.8;  // alternating color length

  const sides = side === 'both' ? ['left','right'] : [side];

  sides.forEach(s => {
    const sign = s === 'left' ? 1 : -1;
    let toggleColor = true;
    for (let i = iStart; i < iEnd - 1; i++) {
      const [x0, z0] = _centerline[i];
      const [x1, z1] = _centerline[i+1];
      const [tx0, tz0] = _tangents[i];
      const [tx1, tz1] = _tangents[i+1];
      const nx0 = -tz0*sign, nz0 = tx0*sign;
      const nx1 = -tz1*sign, nz1 = tx1*sign;

      const inner = hw;
      const outer = hw + STRIP_W;

      const color = toggleColor ? 0xff0000 : 0xffffff;
      toggleColor = !toggleColor;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        x0+nx0*inner, 0.02, z0+nz0*inner,
        x0+nx0*outer, 0.02, z0+nz0*outer,
        x1+nx1*inner, 0.02, z1+nz1*inner,
        x1+nx1*outer, 0.02, z1+nz1*outer,
      ]), 3));
      geo.setIndex([0,1,2, 1,3,2]);
      geo.computeVertexNormals();
      scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 })));
    }
  });
}

function buildSectorMarker(scene, progress) {
  const i = Math.floor(progress * TRACK_SAMPLES);
  const [x, z] = _centerline[i];
  const [tx, tz] = _tangents[i];
  const nx = -tz, nz = tx;
  const hw = 7;
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x + nx*hw, 0.03, z + nz*hw),
    new THREE.Vector3(x - nx*hw, 0.03, z - nz*hw),
  ]);
  scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 })));
}

function buildStartFinish(scene) {
  const [x, z] = _centerline[0];
  const [tx, tz] = _tangents[0];
  const nx = -tz, nz = tx;
  const hw = 7;
  const SQUARE = 1.5;
  const cols = Math.floor(hw * 2 / SQUARE);

  for (let i = 0; i < cols; i++) {
    const color = (i % 2 === 0) ? 0xffffff : 0x111111;
    const offset = -hw + i * SQUARE + SQUARE/2;
    const cx = x + nx*offset;
    const cz = z + nz*offset;
    const geo = new THREE.PlaneGeometry(SQUARE * 0.95, SQUARE * 2.5);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0.04, cz);
    const angle = Math.atan2(tz, tx);
    mesh.rotation.z = -angle;
    // PlaneGeometry is in XY; after rotating X we need to align with tangent
    // use a group instead
    scene.add(makeSFSquare(cx, cz, tx, tz, SQUARE, color));
  }
}

function makeSFSquare(cx, cz, tx, tz, size, color) {
  const geo = new THREE.BufferGeometry();
  const nx = -tz, nz = tx;
  const hs = size / 2 * 0.95;
  const hl = size;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    cx+nx*hs-tx*hl, 0.04, cz+nz*hs-tz*hl,
    cx-nx*hs-tx*hl, 0.04, cz-nz*hs-tz*hl,
    cx+nx*hs+tx*hl, 0.04, cz+nz*hs+tz*hl,
    cx-nx*hs+tx*hl, 0.04, cz-nz*hs+tz*hl,
  ]), 3));
  geo.setIndex([0,1,2, 1,3,2]);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
}

// ─── Runtime queries ─────────────────────────────────────────────────────────

/**
 * Get world position, tangent, and left-normal at a given progress [0,1].
 * Returns { position: THREE.Vector3, tangent: [tx,tz], normal: [nx,nz] }
 */
export function getTrackFrame(progress) {
  const n = _centerline.length;
  const targetLen = ((progress % 1) + 1) % 1 * _totalLength;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (_arcTable[mid] <= targetLen) lo = mid; else hi = mid;
  }
  const t = (_arcTable[hi] > _arcTable[lo])
    ? (targetLen - _arcTable[lo]) / (_arcTable[hi] - _arcTable[lo])
    : 0;
  const [x0, z0] = _centerline[lo];
  const [x1, z1] = _centerline[hi % n];
  const [tx0, tz0] = _tangents[lo];
  const [tx1, tz1] = _tangents[hi % n];
  const x  = x0  + t*(x1-x0);
  const z  = z0  + t*(z1-z0);
  const tx = tx0 + t*(tx1-tx0);
  const tz = tz0 + t*(tz1-tz0);
  const tl = Math.sqrt(tx*tx+tz*tz)+1e-12;
  return {
    position: new THREE.Vector3(x, 0, z),
    tangent:  [tx/tl, tz/tl],
    normal:   [-tz/tl, tx/tl],
  };
}

/**
 * Project a world XZ position onto the centerline.
 * Returns { progress [0,1], lateralOffset (m, + = left), onTrack (bool) }
 * Uses a fast nearest-neighbor search over the centerline.
 */
export function projectToCenterline(px, pz, trackWidth) {
  const n = _centerline.length;
  let bestDist2 = Infinity;
  let bestIdx   = 0;

  for (let i = 0; i < n; i++) {
    const dx = px - _centerline[i][0];
    const dz = pz - _centerline[i][1];
    const d2 = dx*dx + dz*dz;
    if (d2 < bestDist2) { bestDist2 = d2; bestIdx = i; }
  }

  const [cx, cz] = _centerline[bestIdx];
  const [tx, tz] = _tangents[bestIdx];
  const nx = -tz, nz = tx;
  const dx = px - cx, dz = pz - cz;
  const lat = dx*nx + dz*nz;     // lateral offset (+ = left of centerline)
  const progress = _arcTable[bestIdx] / _totalLength;
  const onTrack  = Math.abs(lat) < (trackWidth / 2 + 2);  // 2m margin

  return { progress, lateralOffset: lat, onTrack };
}

export function getTotalLength() { return _totalLength; }
