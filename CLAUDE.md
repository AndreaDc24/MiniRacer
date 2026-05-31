# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project

MiniRacer — browser-based mobile racing game (PWA). Porsche 911 GT3 on Monza, steered via smartphone gyroscope. **Zero build step**: Three.js + Cannon-es loaded via CDN, plain HTML/JS/JSON.

---

## Running the App

No build. Serve the project root over HTTP (CORS blocks `file://`):

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

For mobile testing, use `--bind 0.0.0.0` and open on same Wi-Fi.

---

## Planned File Structure

```
miniRacer/
├── index.html
├── src/
│   ├── main.js
│   ├── config/cars/porsche_gt3.js
│   ├── track/
│   │   ├── monza.json          ← GPS centerline in local metric coords
│   │   └── trackBuilder.js
│   ├── physics/
│   │   ├── car.js              ← main physics loop (120 Hz semi-implicit Euler)
│   │   ├── aero.js             ← aero loads + Pacejka tire model
│   │   └── drivetrain.js       ← torque curve, gear logic
│   ├── input/gyro.js
│   ├── rendering/renderer.js
│   └── hud/hud.js
└── screens/
    ├── lobby.js
    └── race.js
```

---

## Screen Flow

```
index.html → LobbyScreen → RaceScreen → (back to Lobby)
```

Lobby exposes all tunable parameters via sliders (see `porsche_gt3.js` for defaults). Params are passed directly into `RaceScreen` at start.

---

## Physics Architecture

**Loop:** fixed 120 Hz semi-implicit Euler integration in `car.js → physicsStep(dt, inputs)`.

Each step:
1. Aero normal loads (`aero.normalLoad_front/rear`) — scale with v²
2. Tire lateral forces (Pacejka linearized + saturated at `mu * Fz`)
3. Engine force (`drivetrain.engineForce`) — clamped to traction limit
4. Aero drag (`aero.drag`)
5. Equations of motion → ax, ay
6. Yaw moment from front/rear lateral force imbalance → yawRate
7. Integrate: speed, heading, velocity, position

**Under/oversteer** emerges naturally from front/rear lateral force saturation — do not script it.

**Key constants:**
- `RHO = 1.225 kg/m³`
- `WHEEL_RADIUS = 0.32 m`
- Moment of inertia `I_zz` derived from mass and wheelbase

---

## Track Module

`monza.json` stores centerline as `[x, z]` pairs in meters, projected from GPS (Mercator, origin = T1: lat 45.6156, lon 9.2811). Track width = 14 m.

`trackBuilder.js` generates Three.js geometry:
- Asphalt: `TubeGeometry` along centerline
- Curbs: alternating red/white 0.5 m strips at indices defined in `curbs[]`
- Grass/gravel: plane ±3 m outside track edges
- Sector markers and start/finish line

Exports `getTrackNormal(progress)` → `{position, tangent, normal}` used by physics to track car position on centerline.

---

## Aero & Tire (`aero.js`)

Aero loads are purely speed-dependent (no pitch/roll). Tire model: linearized Pacejka with hard saturation at `mu * Fz`. Cornering stiffness `C = 10.0`. Slip angles computed from vehicle geometry + yaw rate.

---

## Drivetrain (`drivetrain.js`)

GT3 torque curve: cubic interpolation over 4 key points (400 Nm@3000, 470 Nm@6100, 440 Nm@8000, 200 Nm@9200 rpm). Scaled by `params.torquePeak / 470`. Auto gear: upshift at 85% redline, downshift at 30%.

---

## Input (`gyro.js`)

- Steering: `deviceorientation` event, `gamma` channel, filtered with `steerFilterAlpha` (low-pass)
- iOS requires `DeviceOrientationEvent.requestPermission()` on user gesture
- Throttle/brake: touch overlay, left half = brake, right half = gas
- Dead zone applied before normalization: ±45° maps to ±1

---

## Rendering (`renderer.js`)

Chase camera: fixed ~8 m behind, ~2.5 m above, lerp on position + heading. Car placeholder: box 4.52 × 1.85 × 1.28 m, color `#AA1A1A` (Porsche Guards Red). Pixel ratio capped at 2. No shadows (mobile performance). Sky: `#87CEEB`.

---

## HUD (`hud.js`)

HTML/CSS overlay (absolute position over canvas). Elements: speed (km/h), gear, RPM bar (red above 85% redline), current lap time, best lap, sector deltas (green/red vs best), minimap with car dot. Sector detection via car position projected onto centerline.

---

## GT3 Default Parameters (`porsche_gt3.js`)

| Param | Default | Range |
|---|---|---|
| mass | 1418 kg | 800–2000 |
| enginePower | 375 kW | 200–600 |
| torquePeak | 470 Nm | 300–700 |
| rpmRedline | 9000 rpm | 6000–9500 |
| gearRatios | [3.91, 2.46, 1.72, 1.28, 1.02, 0.84, 0.70] | — |
| finalDrive | 3.44 | 2.5–5.0 |
| ClA_front | 0.35 m² | 0.0–3.0 |
| ClA_rear | 0.45 m² | 0.0–5.0 |
| CdA | 0.70 m² | 0.3–2.0 |
| mu_front/rear | 1.4 | 0.8–2.5 |
| cgBiasRear | 0.60 | 0.3–0.7 |
| cgHeightRatio | 0.32 | 0.2–0.5 |
| wheelbase | 2.457 m | — |
| brakeBias | 0.56 | 0.45–0.65 |
| maxBrakeForce | 18000 N | 5000–30000 |
| maxSteerAngle | 22 deg | 10–40 |
| gyroSensitivity | 1.0 | 0.5–3.0 |
| gyroDeadzone | 0.03 rad | 0.0–0.15 |
| steerFilterAlpha | 0.15 | 0.05–0.4 |
| tireRelaxLength | 0.18 m | 0.1–0.5 |

---

## Implementation Sessions (from plan)

Six independent sessions, each ending with something runnable:
1. **Track** — Monza geometry visible in 3D
2. **Physics** — car drives with keyboard, plausible top speed ~318 km/h
3. **Lobby** — all sliders, Save/Load preset, Reset to GT3
4. **Gyro + camera** — drivable on phone
5. **HUD + timing** — sectors, best lap, minimap
6. **Polish** — camera shake at grip limit, visual tuning

Full detail in `miniRacer_plan.md`.
