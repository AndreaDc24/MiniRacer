import * as THREE from 'three';

// ─── Renderer setup ───────────────────────────────────────────────────────────

let _renderer, _scene, _camera, _carMesh;
let _cameraPos  = new THREE.Vector3();
let _cameraLook = new THREE.Vector3();
let _shakeAmt   = 0;

export function createRenderer(canvas) {
  _renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  _renderer.setClearColor(0x87CEEB);   // sky blue

  window.addEventListener('resize', _onResize);

  _scene = new THREE.Scene();
  _scene.fog = new THREE.Fog(0x87CEEB, 400, 1200);

  // Lighting — no shadows (mobile perf)
  _scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(200, 400, 300);
  _scene.add(sun);

  // Horizon ground plane (very large, below track level)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 8000),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3f, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  _scene.add(ground);

  // Camera
  _camera = new THREE.PerspectiveCamera(65, canvas.clientWidth / canvas.clientHeight, 0.5, 2000);

  // Car mesh — proportioned GT3 box (4.52 × 1.28 × 1.85 m)
  _carMesh = buildCarMesh();
  _scene.add(_carMesh);

  return { scene: _scene, camera: _camera, renderer: _renderer };
}

function buildCarMesh() {
  const group = new THREE.Group();

  // Body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(4.52, 1.28, 1.85),
    new THREE.MeshStandardMaterial({ color: 0xAA1A1A, roughness: 0.4, metalness: 0.3 })
  );
  body.position.y = 0.64 + 0.3;  // sit on ground + suspension offset
  group.add(body);

  // Roof / cabin (slightly narrower)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.55, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xAA1A1A, roughness: 0.4, metalness: 0.3 })
  );
  roof.position.set(0.3, 1.28 + 0.55/2 + 0.3, 0);
  group.add(roof);

  // Wheels (4 cylinders)
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const positions = [
    [ 1.35, 0.32,  0.95],
    [ 1.35, 0.32, -0.95],
    [-1.1,  0.32,  0.95],
    [-1.1,  0.32, -0.95],
  ];
  positions.forEach(([x, y, z]) => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    group.add(w);
  });

  // Front spoiler hint
  const splitter = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.08, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
  );
  splitter.position.set(2.3, 0.25, 0);
  group.add(splitter);

  return group;
}

function _onResize() {
  const canvas = _renderer.domElement;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  _renderer.setSize(w, h, false);
  _camera.aspect = w / h;
  _camera.updateProjectionMatrix();
}

// ─── Per-frame update ─────────────────────────────────────────────────────────

const CAM_DIST   = 9;    // m behind car
const CAM_HEIGHT = 2.8;  // m above car
const CAM_LERP   = 0.08; // position smoothing
const LOOK_LERP  = 0.12; // look-at smoothing

/**
 * @param {object} carState  { position, heading, speed, gripUsage_r }
 * @param {number} shakeInput  0..1 — how much camera shake to apply
 */
export function updateCamera(carState, shakeInput) {
  const { position, heading } = carState;

  // Desired camera position (behind and above car)
  const tx = Math.cos(heading);
  const tz = Math.sin(heading);
  const desiredPos = new THREE.Vector3(
    position.x - tx * CAM_DIST,
    position.y + CAM_HEIGHT,
    position.z - tz * CAM_DIST,
  );
  _cameraPos.lerp(desiredPos, CAM_LERP);

  // Look-at target (slightly ahead of car)
  const desiredLook = new THREE.Vector3(
    position.x + tx * 4,
    position.y + 0.8,
    position.z + tz * 4,
  );
  _cameraLook.lerp(desiredLook, LOOK_LERP);

  // Camera shake (at high grip usage)
  _shakeAmt += (shakeInput > 0.9 ? shakeInput - 0.9 : 0) * 0.12;
  _shakeAmt *= 0.85;
  const shake = _shakeAmt;

  _camera.position.copy(_cameraPos);
  _camera.position.x += (Math.random() - 0.5) * shake * 0.4;
  _camera.position.y += (Math.random() - 0.5) * shake * 0.2;
  _camera.lookAt(_cameraLook);
}

/**
 * Sync the car mesh with physics state.
 */
export function updateCarMesh(carState) {
  _carMesh.position.copy(carState.position);
  _carMesh.rotation.y = -carState.heading;  // Three.js Y rotation is CCW, heading is CW from east
}

export function render() {
  _renderer.render(_scene, _camera);
}

export function getScene()    { return _scene; }
export function getCamera()   { return _camera; }
export function getRenderer() { return _renderer; }

export function destroyRenderer() {
  window.removeEventListener('resize', _onResize);
  _renderer.dispose();
}
