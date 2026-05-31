// ─── Drivetrain ───────────────────────────────────────────────────────────────

export const WHEEL_RADIUS = 0.32;   // m
const RAD_TO_RPM  = 60 / (2 * Math.PI);

// 911 GT3 (992) NA 4.0 — cubic interpolation over real torque points
// [rpm, Nm]
const TORQUE_POINTS = [
  [  500,  200],
  [ 2000,  350],
  [ 3000,  400],
  [ 4000,  440],
  [ 6100,  470],
  [ 7000,  465],
  [ 8000,  440],
  [ 8500,  390],
  [ 9000,  310],
  [ 9200,  200],
  [ 9500,    0],
];

function lerp(a, b, t) { return a + (b - a) * t; }

export function torqueCurve(rpm) {
  const pts = TORQUE_POINTS;
  if (rpm <= pts[0][0])    return pts[0][1];
  if (rpm >= pts[pts.length-1][0]) return pts[pts.length-1][1];
  for (let i = 1; i < pts.length; i++) {
    if (rpm <= pts[i][0]) {
      const t = (rpm - pts[i-1][0]) / (pts[i][0] - pts[i-1][0]);
      return lerp(pts[i-1][1], pts[i][1], t);
    }
  }
  return 0;
}

/**
 * Engine force at the wheels, clamped to traction limit.
 * @param {object} state  carState (needs .rpm, .gear, .speed)
 * @param {object} p      params
 * @param {number} Fz_rear rear axle load (N)
 */
export function engineForce(state, p, Fz_rear) {
  const baseT  = torqueCurve(state.rpm);
  const scaledT = baseT * (p.torquePeak / 470);
  const ratios  = p.gearRatios;
  const gear    = Math.max(0, Math.min(state.gear - 1, ratios.length - 1));
  const wheelT  = scaledT * ratios[gear] * p.finalDrive;
  const F       = wheelT / WHEEL_RADIUS;
  const F_trac  = p.mu_rear * Fz_rear;
  return Math.min(F, F_trac);
}

// ─── Gear logic ───────────────────────────────────────────────────────────────

const AUTO_UPSHIFT_RATIO   = 0.85;  // upshift at this fraction of redline
const AUTO_DOWNSHIFT_RATIO = 0.30;

/**
 * Update RPM from speed and current gear.
 * Also handles automatic shifting if options.gearMode === 'auto'.
 */
export function updateGear(state, p, options) {
  const ratios = p.gearRatios;
  const nGears = ratios.length;

  // RPM from wheel speed
  const omega = Math.max(state.speed, 0) / WHEEL_RADIUS;  // rad/s at wheel
  state.rpm = omega * ratios[state.gear - 1] * p.finalDrive * RAD_TO_RPM;
  state.rpm = Math.max(state.rpm, p.rpmRedline * 0.08);    // idle floor

  if (options.gearMode === 'auto') {
    if (state.rpm > p.rpmRedline * AUTO_UPSHIFT_RATIO && state.gear < nGears) {
      state.gear++;
    }
    if (state.rpm < p.rpmRedline * AUTO_DOWNSHIFT_RATIO && state.gear > 1) {
      state.gear--;
    }
  }

  // Clamp RPM to redline
  state.rpm = Math.min(state.rpm, p.rpmRedline);
}

export function shiftUp(state, p) {
  if (state.gear < p.gearRatios.length) {
    state.gear++;
    return true;
  }
  return false;
}

export function shiftDown(state) {
  if (state.gear > 1) {
    state.gear--;
    return true;
  }
  return false;
}
