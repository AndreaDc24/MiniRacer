// ─── Gyroscope input (mobile) ─────────────────────────────────────────────────

let _filteredBeta = 0;
let _betaOffset   = null;   // calibration: beta value when gyro was enabled
let _active       = false;
let _params       = null;

export function setParams(p) { _params = p; }

/**
 * Request gyro permission (iOS 13+) and start listening.
 * Must be called from a user gesture (button tap).
 */
export async function requestGyro() {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const perm = await DeviceOrientationEvent.requestPermission();
    if (perm !== 'granted') throw new Error('Gyro permission denied');
  }
  _betaOffset   = null;   // will be set on first event
  _filteredBeta = 0;
  window.addEventListener('deviceorientation', _onOrientation, { passive: true });
  _active = true;
}

export function stopGyro() {
  window.removeEventListener('deviceorientation', _onOrientation);
  _active     = false;
  _betaOffset = null;
  _filteredBeta = 0;
}

export function isGyroActive() { return _active; }

function _onOrientation(e) {
  if (!_params) return;
  const beta = e.beta ?? 0;
  // Calibrate on first sample: treat current position as "straight ahead"
  if (_betaOffset === null) _betaOffset = beta;
  const raw = (beta - _betaOffset) * (Math.PI / 180);
  const alpha = _params.steerFilterAlpha;
  _filteredBeta = _filteredBeta + alpha * (raw - _filteredBeta);
}

/**
 * Returns steer input [-1, 1].
 * +1 = full right, -1 = full left.
 */
export function getGyroSteer() {
  if (!_active || !_params || _betaOffset === null) return 0;
  const dz   = _params.gyroDeadzone;
  const beta = Math.abs(_filteredBeta) < dz ? 0 : _filteredBeta;
  // ±45° (π/4 rad) maps to ±1
  const norm = Math.max(-1, Math.min(1, beta / (Math.PI / 4)));
  return norm * _params.gyroSensitivity;
}
