// ─── Gyroscope input (mobile) ─────────────────────────────────────────────────

let _filteredGamma = 0;
let _active        = false;
let _params        = null;

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
  window.addEventListener('deviceorientation', _onOrientation, { passive: true });
  _active = true;
}

export function stopGyro() {
  window.removeEventListener('deviceorientation', _onOrientation);
  _active = false;
  _filteredGamma = 0;
}

export function isGyroActive() { return _active; }

function _onOrientation(e) {
  if (!_params) return;
  // gamma = phone tilt left/right, range roughly ±90°
  const raw = (e.gamma ?? 0) * (Math.PI / 180);  // convert to radians
  const alpha = _params.steerFilterAlpha;
  _filteredGamma = _filteredGamma + alpha * (raw - _filteredGamma);
}

/**
 * Returns steer input [-1, 1].
 * +1 = full right, -1 = full left.
 */
export function getGyroSteer() {
  if (!_active || !_params) return 0;
  const dz   = _params.gyroDeadzone;
  const gamma = Math.abs(_filteredGamma) < dz ? 0 : _filteredGamma;
  // ±45° (π/4 rad) maps to ±1
  const norm = Math.max(-1, Math.min(1, gamma / (Math.PI / 4)));
  return norm * _params.gyroSensitivity;
}
