// ─── HUD overlay ──────────────────────────────────────────────────────────────
// Pure DOM + Canvas2D overlay positioned absolute over the game canvas.

import { getTotalLength } from '../track/trackBuilder.js';

const LS_BEST_LAP     = 'mr_bestLap';
const LS_BEST_SECTORS = 'mr_bestSectors';

function fmt(ms) {
  if (!ms || ms === Infinity) return '--:--.---';
  const m  = Math.floor(ms / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  const ms3 = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2,'0')}.${String(ms3).padStart(3,'0')}`;
}

function fmtDelta(ms) {
  const sign = ms < 0 ? '-' : '+';
  const abs  = Math.abs(ms);
  const s  = Math.floor(abs / 1000);
  const ms3 = Math.floor(abs % 1000);
  return `${sign}${s}.${String(ms3).padStart(3,'0')}`;
}

export class HUD {
  constructor(container, monzaData, sectorSplits) {
    this._container = container;
    this._sectorSplits = sectorSplits;   // [0..1] progress fractions
    this._nSectors = sectorSplits.length + 1;
    this._monzaData = monzaData;

    // Best times (persisted)
    this._bestLap = parseFloat(localStorage.getItem(LS_BEST_LAP)) || Infinity;
    try {
      this._bestSectors = JSON.parse(localStorage.getItem(LS_BEST_SECTORS)) || Array(this._nSectors).fill(Infinity);
    } catch { this._bestSectors = Array(this._nSectors).fill(Infinity); }

    // Current lap state
    this._lapStart       = null;
    this._sectorStart    = null;
    this._currentSector  = 0;
    this._sectorTimes    = [];
    this._currentLapMs   = 0;
    this._lastProgress   = 0;
    this._sectorDeltas   = Array(this._nSectors).fill(null);

    this._buildDOM();
  }

  _buildDOM() {
    this._root = document.createElement('div');
    Object.assign(this._root.style, {
      position: 'absolute', inset: '0',
      pointerEvents: 'none',
      fontFamily: "'Segoe UI', monospace, sans-serif",
      userSelect: 'none',
      WebkitUserSelect: 'none',
    });

    // Speed (bottom left)
    this._speedEl = _el('div', {
      position: 'absolute', bottom: '80px', left: '20px',
      fontSize: '52px', fontWeight: '900', color: '#fff',
      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
    }, '0');
    this._speedUnitEl = _el('div', {
      position: 'absolute', bottom: '78px', left: '125px',
      fontSize: '16px', color: '#ccc',
    }, 'km/h');

    // Gear
    this._gearEl = _el('div', {
      position: 'absolute', bottom: '72px', left: '200px',
      width: '50px', height: '50px',
      background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(6px)',
      borderRadius: '8px', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: '28px', fontWeight: '900',
      color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
    }, '1');

    // RPM bar
    this._rpmBarOuter = _el('div', {
      position: 'absolute', bottom: '44px', left: '20px',
      width: '260px', height: '14px',
      background: 'rgba(0,0,0,0.5)', borderRadius: '7px',
      overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)',
    });
    this._rpmBarInner = _el('div', {
      height: '100%', width: '0%',
      background: '#4caf50', borderRadius: '7px',
      transition: 'background 0.05s',
    });
    this._rpmBarOuter.appendChild(this._rpmBarInner);

    // Lap time (top right)
    this._lapTimeEl = _el('div', {
      position: 'absolute', top: '16px', right: '20px',
      fontSize: '26px', fontWeight: '700', color: '#fff',
      textShadow: '0 2px 6px rgba(0,0,0,0.8)',
      textAlign: 'right',
    }, '--:--.---');
    this._bestLapEl = _el('div', {
      position: 'absolute', top: '48px', right: '20px',
      fontSize: '14px', color: '#aaa',
      textAlign: 'right',
    }, `BEST ${fmt(this._bestLap)}`);

    // Sector deltas (top right, below best)
    this._sectorEls = Array.from({ length: this._nSectors }, (_, i) =>
      _el('div', {
        position: 'absolute', top: `${70 + i * 20}px`, right: '20px',
        fontSize: '14px', fontWeight: '600', color: '#aaa',
        textAlign: 'right',
      }, `S${i+1} --`)
    );

    // Minimap (top left)
    this._minimapCanvas = document.createElement('canvas');
    this._minimapCanvas.width  = 140;
    this._minimapCanvas.height = 100;
    Object.assign(this._minimapCanvas.style, {
      position: 'absolute', top: '16px', left: '16px',
      background: 'rgba(0,0,0,0.55)', borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.2)',
    });
    this._minimapCtx = this._minimapCanvas.getContext('2d');

    // Assemble
    [this._speedEl, this._speedUnitEl, this._gearEl,
     this._rpmBarOuter, this._lapTimeEl, this._bestLapEl,
     ...this._sectorEls, this._minimapCanvas,
    ].forEach(e => this._root.appendChild(e));

    this._container.appendChild(this._root);

    // Pre-compute minimap path
    this._buildMinimapPath();
  }

  _buildMinimapPath() {
    // Will be called after track is built — trackBuilder centerline must exist
    // We import getTotalLength to check; actual centerline accessed via getTrackFrame
    // Just flag for lazy init on first update
    this._minimapReady = false;
  }

  _initMinimap(monzaData) {
    // Use controlPoints to draw a low-res track outline
    const pts = monzaData.controlPoints;
    const xs  = pts.map(p => p[0]);
    const zs  = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const W = this._minimapCanvas.width  - 16;
    const H = this._minimapCanvas.height - 16;
    const scaleX = W / (maxX - minX + 1);
    const scaleZ = H / (maxZ - minZ + 1);
    const sc = Math.min(scaleX, scaleZ);
    const offX = (this._minimapCanvas.width  - (maxX-minX)*sc) / 2;
    const offZ = (this._minimapCanvas.height - (maxZ-minZ)*sc) / 2;
    this._mmScale = sc;
    this._mmOffX  = offX - minX * sc;
    this._mmOffZ  = offZ - minZ * sc;
    this._mmPts   = pts;
    this._minimapReady = true;
  }

  _drawMinimap(carPx, carPz) {
    const ctx = this._minimapCtx;
    const W = this._minimapCanvas.width, H = this._minimapCanvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!this._minimapReady) {
      this._initMinimap(this._monzaData);
    }

    const toMM = (x, z) => [
      this._mmOffX + x * this._mmScale,
      H - (this._mmOffZ + z * this._mmScale),
    ];

    // Draw track outline
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    const pts = this._mmPts;
    const [sx, sz] = toMM(pts[0][0], pts[0][1]);
    ctx.moveTo(sx, sz);
    for (let i = 1; i < pts.length; i++) {
      const [px, pz] = toMM(pts[i][0], pts[i][1]);
      ctx.lineTo(px, pz);
    }
    ctx.closePath();
    ctx.stroke();

    // Car dot
    const [cx, cz] = toMM(carPx, carPz);
    ctx.fillStyle   = '#FF3030';
    ctx.beginPath();
    ctx.arc(cx, cz, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Update all HUD elements.
   * @param {object} carState  physics state
   * @param {object} p         vehicle params
   * @param {number} now       performance.now() timestamp
   */
  update(carState, p, now) {
    const kmh = carState.speed * 3.6;
    this._speedEl.textContent = Math.round(kmh);
    this._gearEl.textContent  = carState.gear;

    // RPM bar
    const rpmFrac = Math.min(carState.rpm / p.rpmRedline, 1);
    this._rpmBarInner.style.width = (rpmFrac * 100).toFixed(1) + '%';
    this._rpmBarInner.style.background = rpmFrac > 0.85 ? '#e53935' : '#4caf50';

    // Lap timing
    if (this._lapStart !== null) {
      this._currentLapMs = now - this._lapStart;
      this._lapTimeEl.textContent = fmt(this._currentLapMs);
    }

    // Sector / lap detection based on trackProgress
    this._checkProgress(carState.trackProgress, now);

    // Minimap
    this._drawMinimap(carState.position.x, carState.position.z);
  }

  _checkProgress(progress, now) {
    const prev = this._lastProgress;
    this._lastProgress = progress;

    // Progress wraps 0→1: crossing 0 means lap complete
    const wrapped = prev > 0.95 && progress < 0.05;

    if (this._lapStart === null) return;  // timing not started yet

    // Check sector splits
    const splits = this._sectorSplits;
    for (let i = this._currentSector; i < splits.length; i++) {
      if (prev < splits[i] && progress >= splits[i]) {
        const sectorMs = now - this._sectorStart;
        this._sectorTimes.push(sectorMs);
        const best = this._bestSectors[i];
        const delta = sectorMs - best;
        this._sectorEls[i].textContent = `S${i+1} ${fmtDelta(delta)}`;
        this._sectorEls[i].style.color = delta < 0 ? '#66bb6a' : '#ef5350';
        if (sectorMs < best || best === Infinity) {
          this._bestSectors[i] = sectorMs;
        }
        this._sectorStart   = now;
        this._currentSector = i + 1;
        break;
      }
    }

    // Lap complete
    if (wrapped) {
      const lapMs = now - this._lapStart;
      // Last sector
      const lastSectorMs = now - this._sectorStart;
      this._sectorTimes.push(lastSectorMs);
      const si = this._nSectors - 1;
      const bestS = this._bestSectors[si];
      this._sectorEls[si].textContent = `S${si+1} ${fmtDelta(lastSectorMs - bestS)}`;
      this._sectorEls[si].style.color = lastSectorMs < bestS ? '#66bb6a' : '#ef5350';
      if (lastSectorMs < bestS) this._bestSectors[si] = lastSectorMs;

      if (lapMs < this._bestLap) {
        this._bestLap = lapMs;
        localStorage.setItem(LS_BEST_LAP, String(lapMs));
        localStorage.setItem(LS_BEST_SECTORS, JSON.stringify(this._bestSectors));
        this._bestLapEl.textContent = `BEST ${fmt(lapMs)}`;
        this._bestLapEl.style.color = '#66bb6a';
        setTimeout(() => { this._bestLapEl.style.color = '#aaa'; }, 3000);
      }

      // Reset for next lap
      this._lapStart      = now;
      this._sectorStart   = now;
      this._currentSector = 0;
      this._sectorTimes   = [];
    }
  }

  /** Call when car crosses SF for the first time (race start). */
  startTiming(now) {
    this._lapStart      = now;
    this._sectorStart   = now;
    this._currentSector = 0;
    this._sectorTimes   = [];
    this._lastProgress  = 0;
  }

  destroy() {
    this._root.remove();
  }
}

// ─── DOM helper ──────────────────────────────────────────────────────────────

function _el(tag, styles, textContent) {
  const el = document.createElement(tag);
  Object.assign(el.style, styles);
  if (textContent !== undefined) el.textContent = textContent;
  return el;
}
