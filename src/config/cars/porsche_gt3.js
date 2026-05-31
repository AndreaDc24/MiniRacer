// Porsche 911 GT3 (992) — all physical constants and lobby schema

export const GT3_DEFAULTS = {
  // Engine
  enginePower:      375,    // kW
  torquePeak:       470,    // Nm
  rpmRedline:       9000,   // rpm
  gearRatios:       [3.91, 2.46, 1.72, 1.28, 1.02, 0.84, 0.70],
  finalDrive:       3.44,

  // Mass & Inertia
  mass:             1418,   // kg
  cgHeightRatio:    0.32,   // h_cg / wheelbase
  cgBiasRear:       0.60,   // fraction of mass on rear axle

  // Aero
  ClA_front:        0.35,   // m²
  ClA_rear:         0.45,   // m²
  CdA:              0.70,   // m²

  // Grip
  mu_front:         1.4,
  mu_rear:          1.4,
  tireRelaxLength:  0.18,   // m  (transient response — not used in basic model)

  // Brakes
  brakeBias:        0.56,   // fraction of force on front
  maxBrakeForce:    18000,  // N

  // Input
  gyroSensitivity:  1.0,
  gyroDeadzone:     0.03,   // rad
  steerFilterAlpha: 0.15,
  maxSteerAngle:    22,     // deg

  // Fixed geometry (not exposed as sliders)
  wheelbase:        2.457,  // m
};

// Derived geometry (computed from defaults, updated whenever params change)
export function deriveGeometry(p) {
  const wb = p.wheelbase;
  const b  = wb * p.cgBiasRear;          // CG → rear axle
  const a  = wb - b;                     // CG → front axle
  const h  = wb * p.cgHeightRatio;       // CG height
  // Yaw moment of inertia — box approximation
  const I_zz = p.mass * (a * b);         // simplified: m * a * b
  return { a, b, h, I_zz };
}

// Schema drives lobby UI — order determines visual order within each section
export const PARAM_SCHEMA = [
  // Engine
  { key: 'enginePower',     label: 'Engine Power',    min: 200, max: 600,  step: 5,    unit: 'kW',  section: 'Engine' },
  { key: 'torquePeak',      label: 'Peak Torque',     min: 300, max: 700,  step: 5,    unit: 'Nm',  section: 'Engine' },
  { key: 'rpmRedline',      label: 'Redline',         min: 6000,max: 9500, step: 100,  unit: 'rpm', section: 'Engine' },
  { key: 'finalDrive',      label: 'Final Drive',     min: 2.5, max: 5.0,  step: 0.01, unit: '',    section: 'Engine' },

  // Mass & Inertia
  { key: 'mass',            label: 'Mass',            min: 800, max: 2000, step: 10,   unit: 'kg',  section: 'Mass & Inertia' },
  { key: 'cgHeightRatio',   label: 'CG Height / WB',  min: 0.2, max: 0.5,  step: 0.01, unit: '',    section: 'Mass & Inertia' },
  { key: 'cgBiasRear',      label: 'CG Rear Bias',    min: 0.3, max: 0.7,  step: 0.01, unit: '',    section: 'Mass & Inertia' },

  // Aero
  { key: 'ClA_front',       label: 'ClA Front',       min: 0.0, max: 3.0,  step: 0.05, unit: 'm²',  section: 'Aero' },
  { key: 'ClA_rear',        label: 'ClA Rear',        min: 0.0, max: 5.0,  step: 0.05, unit: 'm²',  section: 'Aero' },
  { key: 'CdA',             label: 'CdA',             min: 0.3, max: 2.0,  step: 0.05, unit: 'm²',  section: 'Aero' },

  // Grip
  { key: 'mu_front',        label: 'μ Front',         min: 0.8, max: 2.5,  step: 0.05, unit: '',    section: 'Grip' },
  { key: 'mu_rear',         label: 'μ Rear',          min: 0.8, max: 2.5,  step: 0.05, unit: '',    section: 'Grip' },
  { key: 'tireRelaxLength', label: 'Tire Relax L',    min: 0.1, max: 0.5,  step: 0.01, unit: 'm',   section: 'Grip' },

  // Brakes
  { key: 'brakeBias',       label: 'Brake Bias F',    min: 0.45,max: 0.65, step: 0.01, unit: '',    section: 'Brakes' },
  { key: 'maxBrakeForce',   label: 'Max Brake Force', min: 5000,max: 30000,step: 500,  unit: 'N',   section: 'Brakes' },

  // Input
  { key: 'gyroSensitivity', label: 'Gyro Sensitivity',min: 0.5, max: 3.0,  step: 0.05, unit: '',    section: 'Input' },
  { key: 'gyroDeadzone',    label: 'Gyro Deadzone',   min: 0.0, max: 0.15, step: 0.005,unit: 'rad', section: 'Input' },
  { key: 'steerFilterAlpha',label: 'Steer Filter',    min: 0.05,max: 0.4,  step: 0.01, unit: '',    section: 'Input' },
  { key: 'maxSteerAngle',   label: 'Max Steer',       min: 10,  max: 40,   step: 1,    unit: '°',   section: 'Input' },
];
