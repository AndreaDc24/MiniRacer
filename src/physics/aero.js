// ─── Aerodynamics + Tire model ────────────────────────────────────────────────

export const RHO = 1.225;  // kg/m³, air density at sea level

// Vertical load on each axle (static + aero downforce)
export function normalLoad_front(v, p) {
  const static_f = p.mass * 9.81 * (1 - p.cgBiasRear);
  const aero_f   = 0.5 * RHO * v * v * p.ClA_front;
  return static_f + aero_f;
}

export function normalLoad_rear(v, p) {
  const static_r = p.mass * 9.81 * p.cgBiasRear;
  const aero_r   = 0.5 * RHO * v * v * p.ClA_rear;
  return static_r + aero_r;
}

// Aerodynamic drag force
export function drag(v, p) {
  return 0.5 * RHO * v * v * p.CdA;
}

// ─── Tire model (Pacejka linearized with saturation) ─────────────────────────
// Cornering stiffness (N/rad per unit Fz) — kept outside params to avoid
// lobby clutter; tuned to feel right with the GT3 defaults.
const C_STIFF = 12.0;

/**
 * Lateral force from a tire.
 * @param {number} slipAngle  radians
 * @param {number} Fz         normal load (N)
 * @param {number} mu         friction coefficient
 * @param {number} gripMult   0..1 off-track penalty multiplier
 */
export function lateralForce(slipAngle, Fz, mu, gripMult = 1) {
  const F_max = mu * Fz * gripMult;
  const raw   = C_STIFF * slipAngle * Fz;
  return Math.sign(raw) * Math.min(Math.abs(raw), F_max);
}

/**
 * Fraction of grip being used [0..1].
 * Useful for HUD feedback and camera shake trigger.
 */
export function gripUsage(slipAngle, Fz, mu) {
  const F_max = mu * Fz + 1e-12;
  const raw   = Math.abs(C_STIFF * slipAngle * Fz);
  return Math.min(raw / F_max, 1);
}

// ─── Slip angle geometry ─────────────────────────────────────────────────────

/**
 * Front slip angle.
 * steerAngle: front wheel steer in radians (positive = left turn)
 * carState: { speed, yawRate, slipAngle_r }
 * p: { a } — CG to front axle
 */
export function slipAngle_front(carState, steerAngle, p) {
  const { speed, yawRate } = carState;
  const Vx = Math.max(speed * Math.cos(carState.slipAngle_r), 0.5);
  const Vy = speed * Math.sin(carState.slipAngle_r);
  return steerAngle - Math.atan2(Vy + yawRate * p.a, Vx);
}

/**
 * Rear slip angle.
 * carState: { speed, yawRate }
 * p: { b } — CG to rear axle
 */
export function slipAngle_rear(carState, p) {
  const Vx = Math.max(carState.speed, 0.5);
  const Vy = carState.yawRate * p.b;
  return -Math.atan2(Vy, Vx);
}
