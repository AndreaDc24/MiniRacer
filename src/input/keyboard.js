// ─── Keyboard + Touch input ───────────────────────────────────────────────────

const keys = new Set();

export function initKeyboard() {
  window.addEventListener('keydown', e => {
    keys.add(e.code);
    e.preventDefault?.();
  }, { passive: false });
  window.addEventListener('keyup', e => keys.delete(e.code));
}

export function isKeyDown(code) { return keys.has(code); }

/**
 * Returns keyboard-only steer [-1, 1].
 * A/ArrowLeft = left (-1), D/ArrowRight = right (+1).
 */
export function getKeySteer() {
  let s = 0;
  if (keys.has('ArrowLeft')  || keys.has('KeyA')) s -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) s += 1;
  return s;
}

export function getKeyThrottle() {
  return (keys.has('ArrowUp')   || keys.has('KeyW')) ? 1 : 0;
}

export function getKeyBrake() {
  return (keys.has('ArrowDown') || keys.has('KeyS') || keys.has('Space')) ? 1 : 0;
}

export function getKeyShiftUp()   { return keys.has('ShiftRight') || keys.has('KeyE'); }
export function getKeyShiftDown() { return keys.has('ControlRight')|| keys.has('KeyQ'); }

// ─── Touch overlay state (managed by RaceScreen, read here) ──────────────────

let _touchThrottle  = 0;
let _touchBrake     = 0;
let _touchShiftUp   = false;
let _touchShiftDown = false;

export function setTouchThrottle(v)  { _touchThrottle  = v; }
export function setTouchBrake(v)     { _touchBrake     = v; }
export function setTouchShiftUp(v)   { _touchShiftUp   = v; }
export function setTouchShiftDown(v) { _touchShiftDown = v; }

export function getTouchThrottle()  { return _touchThrottle; }
export function getTouchBrake()     { return _touchBrake; }
export function getTouchShiftUp()   { return _touchShiftUp; }
export function getTouchShiftDown() { return _touchShiftDown; }

/**
 * Merge all input sources into a single input snapshot.
 * gyroSteer: value from gyro.js (0 if inactive)
 */
export function getInputs(gyroSteer) {
  // Steer: keyboard takes priority if any key is pressed, else gyro
  const kSteer = getKeySteer();
  const steer  = kSteer !== 0 ? kSteer : gyroSteer;

  const throttle = Math.max(getKeyThrottle(), _touchThrottle);
  const brake    = Math.max(getKeyBrake(),    _touchBrake);

  return {
    steer:     Math.max(-1, Math.min(1, steer)),
    throttle:  Math.max(0, Math.min(1, throttle)),
    brake:     Math.max(0, Math.min(1, brake)),
    shiftUp:   getKeyShiftUp()   || _touchShiftUp,
    shiftDown: getKeyShiftDown() || _touchShiftDown,
  };
}
