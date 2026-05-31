import { GT3_DEFAULTS, PARAM_SCHEMA } from '../src/config/cars/porsche_gt3.js';

const LS_PRESET = 'mr_preset';

export class LobbyScreen {
  constructor(container, onStart) {
    this._container = container;
    this._onStart   = onStart;
    this._params    = this._loadParams();
    this._gearMode  = 'auto';
    this._build();
  }

  _loadParams() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_PRESET));
      if (saved) return { ...GT3_DEFAULTS, ...saved };
    } catch {}
    return { ...GT3_DEFAULTS };
  }

  _saveParams() {
    localStorage.setItem(LS_PRESET, JSON.stringify(this._params));
  }

  _build() {
    this._root = document.createElement('div');
    Object.assign(this._root.style, {
      position: 'absolute', inset: '0',
      background: 'linear-gradient(135deg, #0d0d1a 0%, #1a1a3e 100%)',
      overflowY: 'auto', overflowX: 'hidden',
      color: '#fff',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    });

    // ── Header ─────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '24px 24px 0',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      paddingBottom: '20px',
      marginBottom: '20px',
    });
    header.innerHTML = `
      <div style="font-size:28px;font-weight:900;letter-spacing:2px;color:#AA1A1A">
        🏎 MINI RACER
      </div>
      <div style="font-size:14px;color:#888;margin-top:4px">Porsche 911 GT3 · Monza</div>
    `;
    this._root.appendChild(header);

    // ── Sections ───────────────────────────────────────────────────────────
    const sections = {};
    PARAM_SCHEMA.forEach(s => {
      if (!sections[s.section]) sections[s.section] = [];
      sections[s.section].push(s);
    });

    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '16px', padding: '0 16px',
    });

    Object.entries(sections).forEach(([name, items]) => {
      const card = document.createElement('div');
      Object.assign(card.style, {
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px', padding: '16px',
      });
      card.innerHTML = `<div style="font-size:13px;font-weight:700;color:#888;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">${name}</div>`;

      items.forEach(schema => {
        const row = this._buildSlider(schema);
        card.appendChild(row);
      });

      grid.appendChild(card);
    });

    // ── Gearbox card ───────────────────────────────────────────────────────
    const gearCard = document.createElement('div');
    Object.assign(gearCard.style, {
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '12px', padding: '16px',
      gridColumn: '1 / -1',
    });
    gearCard.innerHTML = `<div style="font-size:13px;font-weight:700;color:#888;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">Gearbox</div>`;

    const gearToggle = document.createElement('div');
    Object.assign(gearToggle.style, {
      display: 'flex', gap: '12px',
    });
    ['auto', 'manual'].forEach(mode => {
      const btn = document.createElement('button');
      Object.assign(btn.style, {
        flex: '1', padding: '12px',
        borderRadius: '8px', border: 'none', cursor: 'pointer',
        fontWeight: '700', fontSize: '15px', transition: 'all 0.15s',
      });
      btn.textContent = mode === 'auto' ? '🤖 Automatic' : '🕹 Manual (E/Q, tap)';
      btn.dataset.mode = mode;
      btn.addEventListener('click', () => {
        this._gearMode = mode;
        this._updateGearButtons(gearToggle);
      });
      gearToggle.appendChild(btn);
      this[`_gearBtn_${mode}`] = btn;
    });
    this._updateGearButtons(gearToggle);
    gearCard.appendChild(gearToggle);
    grid.appendChild(gearCard);

    this._root.appendChild(grid);

    // ── Bottom action bar ──────────────────────────────────────────────────
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex', gap: '12px',
      padding: '24px 16px', flexWrap: 'wrap',
    });

    const btnSave = this._makeBtn('💾 Save Preset', '#1565C0', () => {
      this._saveParams();
      btnSave.textContent = '✓ Saved';
      setTimeout(() => { btnSave.textContent = '💾 Save Preset'; }, 1500);
    });

    const btnReset = this._makeBtn('↩ Reset GT3', '#424242', () => {
      this._params = { ...GT3_DEFAULTS };
      this._root.remove();
      this._build();
    });

    const btnStart = this._makeBtn('▶ START RACE', '#AA1A1A', () => {
      this._onStart({ ...this._params }, { gearMode: this._gearMode });
    });
    Object.assign(btnStart.style, {
      flex: '2', fontSize: '18px', fontWeight: '900',
    });

    [btnSave, btnReset, btnStart].forEach(b => bar.appendChild(b));
    this._root.appendChild(bar);

    // Controls hint
    const hint = document.createElement('div');
    Object.assign(hint.style, {
      padding: '0 16px 24px',
      fontSize: '12px', color: '#555', lineHeight: '1.6',
    });
    hint.innerHTML =
      '<b style="color:#777">Desktop controls:</b> W/↑ throttle · S/↓ brake · A/← D/→ steer · E shift up · Q shift down · Space brake<br>' +
      '<b style="color:#777">Mobile:</b> Tilt for steer · Right = gas · Left = brake';
    this._root.appendChild(hint);

    this._container.appendChild(this._root);
  }

  _buildSlider(schema) {
    const { key, label, min, max, step, unit } = schema;
    const val = this._params[key];

    const row = document.createElement('div');
    Object.assign(row.style, {
      marginBottom: '10px',
    });

    const topRow = document.createElement('div');
    Object.assign(topRow.style, {
      display: 'flex', justifyContent: 'space-between',
      marginBottom: '4px', fontSize: '13px',
    });
    const labelEl = document.createElement('span');
    labelEl.style.color = '#bbb';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.style.cssText = 'font-weight:700;color:#fff;min-width:60px;text-align:right';
    valueEl.textContent = `${Number(val).toFixed(step < 1 ? 2 : 0)} ${unit}`;

    topRow.appendChild(labelEl);
    topRow.appendChild(valueEl);
    row.appendChild(topRow);

    const slider = document.createElement('input');
    slider.type  = 'range';
    slider.min   = min;
    slider.max   = max;
    slider.step  = step;
    slider.value = val;
    Object.assign(slider.style, {
      width: '100%', accentColor: '#AA1A1A', cursor: 'pointer',
    });
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      this._params[key] = v;
      valueEl.textContent = `${v.toFixed(step < 1 ? 2 : 0)} ${unit}`;
    });

    row.appendChild(slider);
    return row;
  }

  _updateGearButtons(container) {
    Array.from(container.children).forEach(btn => {
      const active = btn.dataset.mode === this._gearMode;
      Object.assign(btn.style, {
        background:  active ? '#AA1A1A' : 'rgba(255,255,255,0.08)',
        color:       active ? '#fff' : '#888',
        border:      active ? '1px solid #AA1A1A' : '1px solid rgba(255,255,255,0.15)',
      });
    });
  }

  _makeBtn(text, bg, onClick) {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      flex: '1', padding: '14px',
      background: bg, color: '#fff',
      border: 'none', borderRadius: '10px',
      fontWeight: '700', fontSize: '15px', cursor: 'pointer',
      transition: 'opacity 0.15s',
      minWidth: '120px',
    });
    btn.textContent = text;
    btn.addEventListener('pointerdown', () => { btn.style.opacity = '0.7'; });
    btn.addEventListener('pointerup',   () => { btn.style.opacity = '1'; });
    btn.addEventListener('click', onClick);
    return btn;
  }

  destroy() {
    this._root.remove();
  }
}
