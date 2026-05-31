# MiniRacer — Piano Completo per Claude Code

## Stack & Struttura

```
miniRacer/
├── index.html
├── src/
│   ├── main.js
│   ├── config/
│   │   └── cars/
│   │       └── porsche_gt3.js
│   ├── track/
│   │   ├── monza.json
│   │   └── trackBuilder.js
│   ├── physics/
│   │   ├── car.js
│   │   ├── aero.js
│   │   └── drivetrain.js
│   ├── input/
│   │   └── gyro.js
│   ├── rendering/
│   │   └── renderer.js
│   └── hud/
│       └── hud.js
└── screens/
    ├── lobby.js
    └── race.js
```

**Three.js + Cannon-es via CDN, zero build step. PWA pura.**

---

## Screen Flow

```
index.html → LobbyScreen → RaceScreen → (back to Lobby)
```

---

## Lobby Screen

Schermata pre-gara con tutti i parametri modificabili in real-time. Ogni slider aggiorna il valore live con feedback numerico.

**Sezione Motore:**
```javascript
enginePower:     [200, 600]  kW      default 375
torquePeak:      [300, 700]  Nm      default 470
rpmRedline:      [6000,9500] rpm     default 9000
gearRatios:      array[8] editabile  default GT3 reali
finalDrive:      [2.5, 5.0]          default 3.44
```

**Sezione Massa & Inerzia:**
```javascript
mass:            [800, 2000]  kg     default 1418
cgHeightRatio:   [0.2, 0.5]          default 0.32  // h_cg / wheelbase
cgBiasRear:      [0.3, 0.7]          default 0.60  // % massa sul posteriore
```

**Sezione Aerodinamica:**
```javascript
ClA_front:       [0.0, 3.0]  m²     default 0.35
ClA_rear:        [0.0, 5.0]  m²     default 0.45
CdA:             [0.3, 2.0]  m²     default 0.70
```

**Sezione Grip:**
```javascript
mu_front:        [0.8, 2.5]          default 1.4
mu_rear:         [0.8, 2.5]          default 1.4
tireRelaxLength: [0.1, 0.5]  m      default 0.18  // risposta transitoria gomma
```

**Sezione Freni:**
```javascript
brakeBias:       [0.45, 0.65]        default 0.56  // % forza sull'anteriore
maxBrakeForce:   [5000, 30000] N     default 18000
```

**Sezione Input:**
```javascript
gyroSensitivity: [0.5, 3.0]          default 1.0
gyroDeadzone:    [0.0, 0.15]  rad    default 0.03
steerFilterAlpha:[0.05, 0.4]         default 0.15  // low-pass strength
maxSteerAngle:   [10, 40]     deg    default 22
```

Pulsante **"Save Preset"** / **"Load Preset"** → localStorage. Pulsante **"Reset to GT3 Default"**.

---

## Modulo Track — `monza.json` + `trackBuilder.js`

**Fonte:** coordinate GPS centerline Monza da OpenStreetMap, pre-processate e convertite in coordinate metriche locali (proiezione Mercatore, origin = T1 Monza).

`monza.json`:
```json
{
  "name": "Autodromo Nazionale Monza",
  "origin": { "lat": 45.6156, "lon": 9.2811 },
  "length_m": 5793,
  "centerline": [ [x0,z0], [x1,z1], "..." ],
  "trackWidth": 14,
  "sectors": [0, 187, 412],
  "curbs": [ { "start": 12, "end": 18, "side": "left", "color": "#ff0000" }, "..." ],
  "drsZones": [ [0, 45], [310, 370] ]
}
```

`trackBuilder.js` genera:
- **Asfalto:** `TubeGeometry` lungo centerline, larghezza 14m, `MeshStandardMaterial` grigio scuro
- **Cordoli:** strisce 0.5m rosse/bianche alternate ogni 0.5m, posizionate sui bordi agli indici definiti in `curbs[]`
- **Erba/ghiaia:** piano verde/beige fuori dai bordi ±3m
- **Linee bianche bordo pista:** stripe continua sui due bordi
- **Sector markers:** linea trasversale bianca ai 3 split
- **Start/Finish line:** scacchi bianchi/neri

Funzione esposta: `getTrackNormal(progress)` → ritorna `{position, tangent, normal}` a qualsiasi punto della centerline (usato dalla fisica per sapere l'orientamento pista).

---

## Modulo Physics — `car.js`

**Stato macchina (aggiornato ogni frame):**
```javascript
const carState = {
  position:      new THREE.Vector3(),
  velocity:      new THREE.Vector3(),   // world frame, m/s
  heading:       0,                     // yaw rad, world frame
  speed:         0,                     // m/s scalare
  rpm:           0,
  gear:          1,
  steeringAngle: 0,                     // rad, angolo ruote anteriori
  slipAngle_f:   0,                     // rad, slip angle asse ant
  slipAngle_r:   0,                     // rad, slip angle asse post
  yawRate:       0,                     // rad/s
  lateralAcc:    0,                     // m/s², per feedback HUD
  onTrack:       true
}
```

**Loop fisico — integrazione Euler semi-implicita a timestep fisso 120Hz:**

```javascript
function physicsStep(dt, inputs) {
  // 1. Aero loads
  const Fz_f = aero.normalLoad_front(carState.speed, params)
  const Fz_r = aero.normalLoad_rear(carState.speed, params)

  // 2. Tire forces
  const Flat_f = tire.lateralForce(carState.slipAngle_f, Fz_f, params.mu_front)
  const Flat_r = tire.lateralForce(carState.slipAngle_r, Fz_r, params.mu_rear)

  // 3. Longitudinal
  const F_engine = drivetrain.engineForce(carState.rpm, carState.gear, params)
  const F_drag   = aero.drag(carState.speed, params)
  const F_brake  = inputs.brake * params.maxBrakeForce
  const F_long   = F_engine - F_drag - F_brake

  // 4. Equations of motion
  const ax = F_long / params.mass
  const ay = (Flat_f + Flat_r) / params.mass

  // 5. Yaw dynamics
  const M_yaw = Flat_f * params.a - Flat_r * params.b  // a,b = dist CG-assi
  carState.yawRate += (M_yaw / I_zz) * dt

  // 6. Integrate
  carState.speed   += ax * dt
  carState.heading += carState.yawRate * dt
  carState.velocity = headingToVelocity(carState.heading, carState.speed)
  carState.position.addScaledVector(carState.velocity, dt)

  // 7. Update rpm, gear
  drivetrain.updateGear(carState, params)
}
```

---

## Modulo Aero — `aero.js`

```javascript
const RHO = 1.225  // kg/m³

// Carico verticale per asse — F_z cresce con v²
function normalLoad_front(v, p) {
  const static_f = p.mass * 9.81 * (1 - p.cgBiasRear)
  const aero_f   = 0.5 * RHO * v**2 * p.ClA_front
  return static_f + aero_f
}

function normalLoad_rear(v, p) {
  const static_r = p.mass * 9.81 * p.cgBiasRear
  const aero_r   = 0.5 * RHO * v**2 * p.ClA_rear
  return static_r + aero_r
}

// Drag aerodinamico
function drag(v, p) {
  return 0.5 * RHO * v**2 * p.CdA
}
```

---

## Modulo Tire — parte di `aero.js`

Modello Pacejka semplificato (Magic Formula linearizzata con saturazione):

```javascript
// Slip angle → forza laterale, con saturazione al grip limit
function lateralForce(slipAngle, Fz, mu) {
  const F_max = mu * Fz                          // grip limit dipendente da Fz (e quindi da v²)
  const C     = 10.0                             // cornering stiffness
  const raw   = C * slipAngle * Fz              // risposta lineare a basso slip
  return Math.sign(raw) * Math.min(Math.abs(raw), F_max)
}

// Slip angle calcolato dalla geometria del veicolo
function slipAngle_front(carState, steerAngle, params) {
  const Vx = carState.speed * Math.cos(carState.slipAngle_r)
  const Vy = carState.speed * Math.sin(carState.slipAngle_r)
  return steerAngle - Math.atan2(Vy + carState.yawRate * params.a, Vx)
}

function slipAngle_rear(carState, params) {
  const Vx = carState.speed
  const Vy = carState.yawRate * params.b
  return -Math.atan2(Vy, Vx)
}
```

Questo modello produce **sottosterzo naturale** quando `F_lat_f` satura prima di `F_lat_r`, e **sovrasterzo** nel caso opposto — emergente dalla fisica, non scriptato.

---

## Modulo Drivetrain — `drivetrain.js`

```javascript
// Curva di coppia GT3 4.0 NA — interpolazione cubica su punti reali
// Valori chiave: 400Nm@3000, 470Nm@6100, 440Nm@8000, 200Nm@9200
function torqueCurve(rpm) {
  return cubicInterpolate(rpm, torquePoints)
}

function engineForce(rpm, gear, p) {
  const torque      = torqueCurve(rpm) * (p.torquePeak / 470)  // scalato da params
  const wheelTorque = torque * gearRatios[gear] * p.finalDrive
  const F_engine    = wheelTorque / WHEEL_RADIUS                // 0.32m
  const Fz_rear     = normalLoad_rear(carState.speed, p)
  return Math.min(F_engine, p.mu_rear * Fz_rear)               // traction limit
}

// Cambio automatico: upshift a 85% redline, downshift a 30%
function updateGear(carState, p) {
  if (carState.rpm > p.rpmRedline * 0.85 && carState.gear < 7) carState.gear++
  if (carState.rpm < p.rpmRedline * 0.30 && carState.gear > 1) carState.gear--
  carState.rpm = carState.speed
    * gearRatios[carState.gear]
    * p.finalDrive
    / WHEEL_RADIUS
    * RAD_TO_RPM
}
```

---

## Modulo Input — `gyro.js`

```javascript
// iOS richiede permesso esplicito su user gesture
async function requestGyro() {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    const perm = await DeviceOrientationEvent.requestPermission()
    if (perm !== 'granted') throw new Error('Gyro denied')
  }
  window.addEventListener('deviceorientation', onOrientation)
}

// gamma = rotazione laterale del telefono, range ±90°
let filteredGamma = 0
function onOrientation(e) {
  const raw = e.gamma * DEG_TO_RAD
  filteredGamma = filteredGamma + params.steerFilterAlpha * (raw - filteredGamma)
}

function getSteerInput() {
  const gamma      = Math.abs(filteredGamma) < params.gyroDeadzone ? 0 : filteredGamma
  const normalized = clamp(gamma / (Math.PI / 4), -1, 1)  // ±45° → ±1
  return normalized * params.gyroSensitivity * params.maxSteerAngle * DEG_TO_RAD
}
```

Throttle/brake: due zone touch overlay (sinistra = freno, destra = gas), gestite con `touchstart`/`touchend`. Nessun conflitto con il gyro.

---

## Modulo Rendering — `renderer.js`

- **Camera:** chase camera, distanza fissa ~8m, altezza ~2.5m, smooth follow con lerp su posizione e heading
- **Macchina:** box placeholder proporzionato a GT3 (4.52m × 1.85m × 1.28m), colore Porsche Guards Red `#AA1A1A`. Sostituibile con GLTF senza toccare nient'altro
- **Lighting:** `AmbientLight(0xffffff, 0.6)` + `DirectionalLight(0xffffff, 1.0)` fisso, no shadow per performance mobile
- **Cielo:** background color `#87CEEB`
- **Anti-alias:** `antialias: true`, pixel ratio `Math.min(devicePixelRatio, 2)`

---

## Modulo HUD — `hud.js`

Overlay HTML/CSS assoluto sopra il canvas:

```
┌─────────────────────────────────┐
│  [minimap]          [1:23.456]  │
│                     BEST 1:21.2 │
│                                 │
│                    [S1] [S2][S3]│
│ 247 km/h    [6]                 │
│ ████████░░  rpm                 │
└─────────────────────────────────┘
```

- Velocità in km/h grande a sinistra, marcia nel riquadro
- Barra RPM orizzontale, diventa rossa sopra 85% redline
- Tempo giro corrente e best lap in alto a destra
- Delta settori: verde se meglio del best, rosso se peggio
- Minimap top-down del circuito con dot che si muove

---

## Parametri Porsche 911 GT3 (992) — Default

| Parametro | Valore | Note |
|---|---|---|
| `mass` | 1418 kg | Peso omologato |
| `enginePower` | 375 kW | 510 CV @ 8400 rpm |
| `torquePeak` | 470 Nm | @ 6100 rpm |
| `rpmRedline` | 9000 rpm | |
| `gearRatios` | [3.91, 2.46, 1.72, 1.28, 1.02, 0.84, 0.70] | PDK 7 marce |
| `finalDrive` | 3.44 | |
| `topSpeed` | 88.3 m/s | ~318 km/h |
| `ClA_front` | 0.35 m² | |
| `ClA_rear` | 0.45 m² | |
| `CdA` | 0.70 m² | |
| `mu_front` | 1.4 | Michelin Pilot Sport Cup 2 |
| `mu_rear` | 1.4 | |
| `cgBiasRear` | 0.60 | Motore posteriore |
| `wheelbase` | 2.457 m | |
| `brakeBias` | 0.56 | % forza anteriore |
| `maxBrakeForce` | 18000 N | |

---

## Sequenza Sessioni Claude Code

### Sessione 1 — Track (2-3h)
**Obiettivo:** circuito Monza visibile in 3D con cordoli e colori corretti.

Prompt di avvio:
> Crea il progetto miniRacer/ con la struttura definita nel piano. Importa Three.js via CDN. Implementa trackBuilder.js che legge monza.json e genera la geometria del circuito: asfalto grigio, cordoli rossi/bianchi, erba verde, linee bianche di bordo, sector markers e start/finish. Visualizza il circuito dall'alto con camera ortografica per verificare la geometria. Le coordinate di monza.json devono venire da OpenStreetMap, convertite in metri con proiezione locale (origin = T1 Monza lat 45.6156, lon 9.2811).

Criterio di completamento: il circuito visto dall'alto è riconoscibile come Monza, cordoli posizionati correttamente alla Prima Variante, Lesmo 1/2, Ascari, Parabolica.

### Sessione 2 — Physics (3-4h)
**Obiettivo:** macchina che gira su Monza con keyboard, fisica realistica.

Prompt di avvio:
> Implementa car.js, aero.js e drivetrain.js seguendo esattamente il modello fisico del piano. Parametri default GT3 da porsche_gt3.js. Testa con WASD/frecce prima del gyro. Verifica: velocità max ~318 km/h in rettilineo, alla Parabolica (raggio ~180m) a 200 km/h la forza laterale richiesta deve essere confrontabile con il grip limit calcolato dal modello.

Criterio di completamento: la macchina percorre Monza senza esplodere numericamente, la velocità di punta è plausibile, si sente la differenza di grip tra bassa e alta velocità.

### Sessione 3 — Lobby + Params (1-2h)
**Obiettivo:** lobby funzionante con tutti gli slider, preset GT3 default.

Prompt di avvio:
> Implementa screens/lobby.js con tutti i parametri elencati nel piano, organizzati nelle sezioni: Motore, Massa & Inerzia, Aerodinamica, Grip, Freni, Input. Ogni slider mostra il valore numerico live. Implementa Save/Load preset su localStorage e il pulsante Reset to GT3 Default. I parametri vengono passati a RaceScreen all'avvio della gara.

Criterio di completamento: modificare ClA_rear da 0.45 a 2.0, avviare la gara, verificare che in curva ad alta velocità il grip sia visibilmente aumentato.

### Sessione 4 — Gyro + Camera (1-2h)
**Obiettivo:** guidabile su telefono.

Prompt di avvio:
> Implementa gyro.js con requestPermission per iOS. Sostituisci l'input keyboard con il gyro per lo sterzo. Aggiungi touch overlay per gas e freno (zona sinistra e destra dello schermo). Implementa la chase camera con lerp in renderer.js. Testa su dispositivo reale, calibra gyroDeadzone e steerFilterAlpha finché il controllo è fluido.

Criterio di completamento: si riesce a completare un giro di Monza con il telefono senza uscire di pista nei rettilinei.

### Sessione 5 — HUD + Timing (1-2h)
**Obiettivo:** tempi sul giro, settori, minimap.

Prompt di avvio:
> Implementa hud.js con: velocità km/h, marcia, barra RPM con zona rossa, tempo giro corrente, best lap, delta sui 3 settori di Monza (verde/rosso), minimap con dot position. Il rilevamento settori usa la proiezione del punto macchina sulla centerline.

Criterio di completamento: un giro completo registra i 3 split e il tempo totale, il best lap viene salvato in sessione.

### Sessione 6 — Polish (1-2h)
**Obiettivo:** feel finale.

Prompt di avvio:
> Rifila il progetto: colore macchina Porsche Guards Red #AA1A1A, verifica visiva dei cordoli Monza (Prima Variante, Lesmo, Ascari, Parabolica), aggiungi leggero shake camera quando si supera il grip limit laterale del 90%, tuning empirico dei parametri GT3 se la fisica non convince. Opzionale: se disponibile un file .glb della 911 GT3, sostituisci il box placeholder.

---

## Cosa Devi Fornire

**Niente di obbligatorio.** Tutto è ricavabile da fonti pubbliche.

Opzionale:
- Un file `.glb`/`.gltf` della 911 GT3 (disponibile gratis su Sketchfab) per sostituire il box placeholder nella sessione 6, in ~10 minuti
- Preferenza su **cambio manuale** (tap su schermo per shiftare) vs automatico — default automatico

---

## Stima Totale

**10-15h di lavoro attivo**, 6 sessioni indipendenti. Ogni sessione termina con qualcosa di funzionante e testabile.

Il rischio principale è la **sessione 1**: se i dati OSM di Monza sono rumorosi, aggiungere 1h di pulizia coordinate. Si può mitigare pre-processando il JSON prima di iniziare.
