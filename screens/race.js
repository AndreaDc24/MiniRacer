import * as THREE from 'three';
import { buildTrack, getTrackFrame, projectToCenterline } from '../src/track/trackBuilder.js';
import {
  createRenderer, updateCamera, updateCarMesh, render, destroyRenderer,
} from '../src/rendering/renderer.js';
import { createCarState, physicsUpdate, resetToTrack, injectTrackFrame } from '../src/physics/car.js';
import { requestGyro, stopGyro, isGyroActive, getGyroSteer, setParams as setGyroParams } from '../src/input/gyro.js';
import {
  initKeyboard, getInputs,
  setTouchThrottle, setTouchBrake, setTouchShiftUp, setTouchShiftDown,
} from '../src/input/keyboard.js';
import { shiftUp, shiftDown } from '../src/physics/drivetrain.js';
import { HUD } from '../src/hud/hud.js';

export class RaceScreen {
  constructor(container, params, options, onBack) {
    this._container = container;
    this._params    = params;
    this._options   = { ...options };
    this._onBack    = onBack;
    this._rafId     = null;
    this._running   = false;

    this._state     = createCarState();
    this._prevShiftUp   = false;
    this._prevShiftDown = false;

    // Inject getTrackFrame into car.js (avoids circular dep)
    injectTrackFrame(getTrackFrame);

    this._build();
  }

  async _build() {
    try {
      await this._buildInner();
    } catch (err) {
      this._showError(err);
    }
  }

  _showError(err) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', inset: '0', background: '#1a1a2e',
      color: '#ff5252', fontFamily: 'monospace', fontSize: '14px',
      padding: '24px', whiteSpace: 'pre-wrap', zIndex: '9999', overflowY: 'auto',
    });
    el.textContent = 'RACE ERROR\n\n' + (err?.stack || err);
    document.body.appendChild(el);
  }

  async _buildInner() {
    // ── Fetch track data ──────────────────────────────────────────────────
    const monzaData = await fetch('src/track/monza.json').then(r => r.json());
    this._monzaData = monzaData;
    this._options.trackWidth = monzaData.trackWidth;

    // ── DOM ────────────────────────────────────────────────────────────────
    this._root = document.createElement('div');
    Object.assign(this._root.style, {
      position: 'absolute', inset: '0', background: '#1a1a2e',
    });
    this._container.appendChild(this._root);

    // Canvas
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'gameCanvas';
    Object.assign(this._canvas.style, {
      display: 'block', width: '100%', height: '100%',
    });
    this._root.appendChild(this._canvas);

    // ── Renderer ───────────────────────────────────────────────────────────
    const { scene } = createRenderer(this._canvas);

    // ── Track ──────────────────────────────────────────────────────────────
    buildTrack(scene, monzaData);

    // ── Place car at start ────────────────────────────────────────────────
    const startFrame = getTrackFrame(0);
    this._state.position.copy(startFrame.position);
    this._state.position.y = 0;
    const [tx, tz] = startFrame.tangent;
    this._state.heading = Math.atan2(tz, tx);

    // ── Input ──────────────────────────────────────────────────────────────
    initKeyboard();
    setGyroParams(this._params);
    this._buildTouchOverlay();

    // ── HUD ────────────────────────────────────────────────────────────────
    this._hud = new HUD(this._root, this._monzaData, monzaData.sectorSplits);

    // ── Back button ────────────────────────────────────────────────────────
    this._buildBackButton();

    // ── Gyro button (mobile) ───────────────────────────────────────────────
    this._buildGyroButton();

    // ── Start loop ────────────────────────────────────────────────────────
    this._hud.startTiming(performance.now());
    this._lastTime = performance.now();
    this._running  = true;
    this._loop();
  }

  _loop() {
    this._rafId = requestAnimationFrame(ts => {
      if (!this._running) return;
      const dt = Math.min((ts - this._lastTime) / 1000, 0.05);
      this._lastTime = ts;

      this._tick(dt, ts);
      this._loop();
    });
  }

  _tick(dt, ts) {
    const p   = this._params;
    const opt = this._options;

    // ── Gather inputs ─────────────────────────────────────────────────────
    const gyroSteer = isGyroActive() ? getGyroSteer() : 0;
    const inputs    = getInputs(gyroSteer);

    // Manual shift edges
    if (opt.gearMode === 'manual') {
      const su = inputs.shiftUp;
      const sd = inputs.shiftDown;
      if (su && !this._prevShiftUp)   shiftUp(this._state, p);
      if (sd && !this._prevShiftDown) shiftDown(this._state);
      this._prevShiftUp   = su;
      this._prevShiftDown = sd;
    }

    // ── Physics ───────────────────────────────────────────────────────────
    physicsUpdate(this._state, dt, inputs, p, opt);

    // ── Handle stuck reset request ────────────────────────────────────────
    if (this._state._needsReset) {
      this._state._needsReset = false;
      resetToTrack(this._state);
    }

    // ── Rendering ─────────────────────────────────────────────────────────
    updateCarMesh(this._state);
    const shakeInput = Math.max(this._state.gripUsage_r, this._state.gripUsage_f);
    updateCamera(this._state, shakeInput);
    render();

    // ── HUD ───────────────────────────────────────────────────────────────
    this._hud.update(this._state, p, ts);
  }

  // ── Touch overlay ─────────────────────────────────────────────────────────

  _buildTouchOverlay() {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'absolute', inset: '0',
      display: 'flex', pointerEvents: 'none',
      userSelect: 'none', WebkitUserSelect: 'none',
    });

    // Left half = brake
    const leftZone = _zone('rgba(255,255,255,0)');
    leftZone.addEventListener('touchstart', e => { e.preventDefault(); setTouchBrake(1); },   { passive: false });
    leftZone.addEventListener('touchend',   e => { e.preventDefault(); setTouchBrake(0); },   { passive: false });

    // Right half = throttle
    const rightZone = _zone('rgba(255,255,255,0)');
    rightZone.addEventListener('touchstart', e => { e.preventDefault(); setTouchThrottle(1); }, { passive: false });
    rightZone.addEventListener('touchend',   e => { e.preventDefault(); setTouchThrottle(0); }, { passive: false });

    overlay.appendChild(leftZone);
    overlay.appendChild(rightZone);

    // Manual shift buttons (visible only in manual mode)
    if (this._options.gearMode === 'manual') {
      const btnUp   = _shiftBtn('▲', '90px', '20px');
      const btnDown = _shiftBtn('▼', '20px', '20px');
      btnUp.addEventListener('touchstart',   () => setTouchShiftUp(true),    { passive: true });
      btnUp.addEventListener('touchend',     () => setTouchShiftUp(false),   { passive: true });
      btnDown.addEventListener('touchstart', () => setTouchShiftDown(true),  { passive: true });
      btnDown.addEventListener('touchend',   () => setTouchShiftDown(false), { passive: true });
      overlay.appendChild(btnUp);
      overlay.appendChild(btnDown);
    }

    overlay.style.pointerEvents = 'auto';
    this._root.appendChild(overlay);
  }

  _buildBackButton() {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      position: 'absolute', top: '16px', left: '170px',
      padding: '8px 16px',
      background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
      color: '#fff', borderRadius: '8px', fontSize: '13px',
      cursor: 'pointer', zIndex: '10',
    });
    btn.textContent = '← Lobby';
    btn.addEventListener('click', () => this._onBack());
    this._root.appendChild(btn);
  }

  _buildGyroButton() {
    if (!('DeviceOrientationEvent' in window)) return;
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      position: 'absolute', top: '16px', left: '270px',
      padding: '8px 16px',
      background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)',
      color: '#fff', borderRadius: '8px', fontSize: '13px',
      cursor: 'pointer', zIndex: '10',
    });
    btn.textContent = '📱 Enable Gyro';
    btn.addEventListener('click', async () => {
      try {
        await requestGyro();
        btn.textContent = '✓ Gyro ON';
        btn.style.borderColor = '#66bb6a';
      } catch (err) {
        btn.textContent = '✗ Gyro denied';
        btn.style.borderColor = '#ef5350';
      }
    });
    this._root.appendChild(btn);
  }

  destroy() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    stopGyro();
    destroyRenderer();
    if (this._hud) this._hud.destroy();
    this._root.remove();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _zone(bg) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    flex: '1', height: '100%', background: bg,
    touchAction: 'none',
  });
  return el;
}

function _shiftBtn(label, bottom, right) {
  const btn = document.createElement('button');
  Object.assign(btn.style, {
    position: 'absolute', bottom, right,
    width: '56px', height: '56px',
    background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', borderRadius: '50%',
    fontSize: '22px', fontWeight: '900', cursor: 'pointer',
    touchAction: 'none', pointerEvents: 'auto',
    zIndex: '5',
  });
  btn.textContent = label;
  return btn;
}
