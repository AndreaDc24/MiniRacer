import * as THREE from 'three';
import {
  normalLoad_front, normalLoad_rear, drag,
  lateralForce, slipAngle_front, slipAngle_rear, gripUsage,
} from './aero.js';
import { engineForce, updateGear, WHEEL_RADIUS } from './drivetrain.js';
import { projectToCenterline } from '../track/trackBuilder.js';
import { deriveGeometry } from '../config/cars/porsche_gt3.js';

// getTrackFrame is injected after track loads (avoids circular import)
let _getTrackFrame = null;
export function injectTrackFrame(fn) { _getTrackFrame = fn; }

// ─── State ────────────────────────────────────────────────────────────────────

export function createCarState() {
  return {
    position:     new THREE.Vector3(0, 0, 0),
    velocity:     new THREE.Vector3(0, 0, 0),
    heading:      Math.PI,   // radians, world frame (initially pointing -X = west)
    speed:        0,         // m/s scalar (always ≥ 0)
    rpm:          1000,
    gear:         1,
    steeringAngle:0,         // rad, front wheel angle
    slipAngle_f:  0,         // rad
    slipAngle_r:  0,         // rad
    yawRate:      0,         // rad/s
    lateralAcc:   0,         // m/s²
    onTrack:      true,
    trackProgress:0,         // 0..1
    lateralOffset:0,         // m

    // For grip feedback
    gripUsage_f:  0,
    gripUsage_r:  0,

    // Timing
    lapStartTime: null,
    currentLapTime: 0,
  };
}

// ─── Physics step ─────────────────────────────────────────────────────────────

const PHYSICS_DT    = 1 / 120;
const OFF_TRACK_MU  = 0.4;   // grip penalty on grass/gravel
const STUCK_TIMEOUT = 3.0;   // seconds before auto-reset

let stuckTimer = 0;

/**
 * Advance physics by exactly one timestep.
 * @param {object} state   car state (mutated in place)
 * @param {number} dt      timestep (should always be PHYSICS_DT = 1/120)
 * @param {object} inputs  { throttle [0,1], brake [0,1], steer [-1,1] }
 * @param {object} p       vehicle params
 * @param {object} options { gearMode: 'auto'|'manual', trackWidth }
 */
export function physicsStep(state, dt, inputs, p, options) {
  // ── Derived geometry (cached on first call or when params change) ──────────
  const geo = deriveGeometry(p);
  const { a, b, I_zz } = geo;

  // ── Steering ──────────────────────────────────────────────────────────────
  const targetSteer = inputs.steer * p.maxSteerAngle * Math.PI / 180;
  // Simple first-order filter for steering response
  state.steeringAngle += (targetSteer - state.steeringAngle) * 0.3;

  // ── Grip multiplier (off-track penalty) ───────────────────────────────────
  const info = projectToCenterline(state.position.x, state.position.z, options.trackWidth);
  state.onTrack      = info.onTrack;
  state.trackProgress = info.progress;
  state.lateralOffset = info.lateralOffset;
  const mu_mult = state.onTrack ? 1 : OFF_TRACK_MU;

  // ── Aero loads ────────────────────────────────────────────────────────────
  const v     = state.speed;
  const Fz_f  = normalLoad_front(v, p);
  const Fz_r  = normalLoad_rear(v, p);

  // ── Slip angles ───────────────────────────────────────────────────────────
  state.slipAngle_f = slipAngle_front(state, state.steeringAngle, { a });
  state.slipAngle_r = slipAngle_rear(state, { b });

  // ── Tire forces ───────────────────────────────────────────────────────────
  const Flat_f = lateralForce(state.slipAngle_f, Fz_f, p.mu_front, mu_mult);
  const Flat_r = lateralForce(state.slipAngle_r, Fz_r, p.mu_rear,  mu_mult);

  // Store grip usage for HUD / camera shake
  state.gripUsage_f = gripUsage(state.slipAngle_f, Fz_f, p.mu_front) * mu_mult;
  state.gripUsage_r = gripUsage(state.slipAngle_r, Fz_r, p.mu_rear)  * mu_mult;

  // ── Longitudinal ──────────────────────────────────────────────────────────
  const F_eng    = inputs.throttle > 0.01
    ? engineForce(state, p, Fz_r) * inputs.throttle
    : 0;
  const F_drag   = drag(v, p);
  const F_br_tot = inputs.brake * p.maxBrakeForce;
  // Net longitudinal force (positive = forward)
  const F_long   = F_eng - F_drag - F_br_tot;
  const ax       = F_long / p.mass;

  // ── Yaw dynamics ──────────────────────────────────────────────────────────
  const M_yaw = Flat_f * a - Flat_r * b;
  state.yawRate  += (M_yaw / I_zz) * dt;
  // Small damping to prevent divergence
  state.yawRate  *= 0.998;

  // ── Lateral acceleration (for HUD) ────────────────────────────────────────
  state.lateralAcc = (Flat_f + Flat_r) / p.mass;

  // ── Integrate speed ───────────────────────────────────────────────────────
  state.speed += ax * dt;
  state.speed  = Math.max(state.speed, 0);   // no reversing in this version

  // ── Integrate heading ─────────────────────────────────────────────────────
  state.heading += state.yawRate * dt;

  // ── Update velocity vector ────────────────────────────────────────────────
  const vx = state.speed * Math.cos(state.heading);
  const vz = state.speed * Math.sin(state.heading);
  state.velocity.set(vx, 0, vz);

  // ── Integrate position ────────────────────────────────────────────────────
  state.position.addScaledVector(state.velocity, dt);

  // ── Update gear + RPM ────────────────────────────────────────────────────
  updateGear(state, p, options);

  // ── Stuck detection ───────────────────────────────────────────────────────
  if (state.speed < 1.0 && Math.abs(inputs.throttle) > 0.1) {
    stuckTimer += dt;
  } else {
    stuckTimer = 0;
  }
  if (stuckTimer > STUCK_TIMEOUT) {
    stuckTimer = 0;
    resetToTrack(state);
  }
}

// ─── Fixed-timestep accumulator wrapper ──────────────────────────────────────

let _accumulator = 0;

/**
 * Call from rAF loop with real wallclock delta.
 * Runs as many 120 Hz physics steps as needed.
 */
export function physicsUpdate(state, wallDt, inputs, p, options) {
  _accumulator += Math.min(wallDt, 0.1);  // cap to avoid spiral of death
  while (_accumulator >= PHYSICS_DT) {
    physicsStep(state, PHYSICS_DT, inputs, p, options);
    _accumulator -= PHYSICS_DT;
  }
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/**
 * Snap the car back to the nearest centerline point, facing the right direction.
 */
export function resetToTrack(state) {
  if (!_getTrackFrame) return;
  const frame = _getTrackFrame(state.trackProgress);
  state.position.copy(frame.position);
  state.position.y = 0;
  const [tx, tz] = frame.tangent;
  state.heading  = Math.atan2(tz, tx);
  state.speed    = 0;
  state.yawRate  = 0;
  state.velocity.set(0, 0, 0);
  state.gear     = 1;
  state.rpm      = 1000;
  stuckTimer     = 0;
}

export { PHYSICS_DT };
