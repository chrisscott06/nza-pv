// Roof geometry generators.
//
// Each generator returns a list of `LocalFace` objects. A LocalFace is in
// "OBB-local" coordinates: +X along the long axis, +Y across the width,
// +Z up. The regenerator transforms each face back into lng/lat at world
// scale and decorates with area/tilt/azimuth metadata.

import type { FaceRole, Roof, RoofStyle } from '@nza-pv/shared';

export type V3 = [number, number, number];
export type LocalFace = {
  role: FaceRole;
  /** Ring of vertices in OBB-local metres (+X along length, +Y across width). */
  ring: V3[];
};

export type GeneratorInput = {
  /** Half-length of the OBB long axis. */
  halfL: number;
  /** Half-width of the OBB short axis. */
  halfW: number;
  /** Eave height (top of wall) in metres. */
  eave: number;
};

const DEG = Math.PI / 180;

export function generateRoof(roof: Roof, input: GeneratorInput): LocalFace[] {
  switch (roof.style) {
    case 'flat':
      return flat(input, roof.parapet_height_m);
    case 'mono':
      return mono(input, roof.pitch_deg, roof.high_side);
    case 'gable':
      return gable(input, roof.pitch_deg);
    case 'hip':
      return hip(input, roof.pitch_deg);
    case 'dutch_hip':
      return dutchHip(input, roof.pitch_deg, roof.hip_ratio);
    case 'gambrel':
      return gambrel(input, roof.lower_pitch_deg, roof.upper_pitch_deg, roof.break_height_m);
    case 'mansard':
      return mansard(input, roof.lower_pitch_deg, roof.upper_pitch_deg, roof.break_height_m);
    case 'saltbox':
      return saltbox(input, roof.front_pitch_deg, roof.back_pitch_deg, roof.ridge_offset_pct);
    case 'sawtooth':
      return sawtooth(input, roof.pitch_count, roof.pitch_deg, roof.glazing_strip_width_m);
    case 'butterfly':
      return butterfly(input, roof.pitch_deg, roof.valley_depth_m);
    case 'pyramid':
      return pyramid(input, roof.pitch_deg);
    case 'cross_gabled':
      return crossGabled(input, roof.pitch_deg);
  }
}

export function isStyle(style: RoofStyle | string): style is RoofStyle {
  return [
    'flat',
    'mono',
    'gable',
    'hip',
    'dutch_hip',
    'gambrel',
    'mansard',
    'saltbox',
    'sawtooth',
    'butterfly',
    'pyramid',
    'cross_gabled',
  ].includes(style);
}

// --- Primitives -------------------------------------------------------------

function rectRing(hl: number, hw: number, z: number): V3[] {
  return [
    [-hl, -hw, z],
    [hl, -hw, z],
    [hl, hw, z],
    [-hl, hw, z],
  ];
}

// --- Style generators -------------------------------------------------------

function flat({ halfL, halfW, eave }: GeneratorInput, parapet: number): LocalFace[] {
  const top: V3[] = rectRing(halfL, halfW, eave);
  const faces: LocalFace[] = [{ role: 'main', ring: top }];
  if (parapet > 0) {
    const inset = 0.15; // 15cm parapet thickness
    // Four parapet walls — model them as 'gable_end_wall' so they're flagged
    // non-PV (vertical) when tilt is computed.
    const z0 = eave;
    const z1 = eave + parapet;
    faces.push(
      { role: 'gable_end_wall', ring: [[-halfL, halfW, z0], [halfL, halfW, z0], [halfL, halfW, z1], [-halfL, halfW, z1]] }, // N
      { role: 'gable_end_wall', ring: [[halfL, -halfW, z0], [-halfL, -halfW, z0], [-halfL, -halfW, z1], [halfL, -halfW, z1]] }, // S
      { role: 'gable_end_wall', ring: [[halfL, halfW, z0], [halfL, -halfW, z0], [halfL, -halfW, z1], [halfL, halfW, z1]] }, // E
      { role: 'gable_end_wall', ring: [[-halfL, -halfW, z0], [-halfL, halfW, z0], [-halfL, halfW, z1], [-halfL, -halfW, z1]] }, // W
    );
    // Inset top recess
    const ix = halfL - inset;
    const iy = halfW - inset;
    faces.push({ role: 'main', ring: [[-ix, -iy, z1], [ix, -iy, z1], [ix, iy, z1], [-ix, iy, z1]] });
  }
  return faces;
}

function mono({ halfL, halfW, eave }: GeneratorInput, pitch: number, highSide: 'N' | 'E' | 'S' | 'W' | number): LocalFace[] {
  const rise = 2 * halfW * Math.tan(pitch * DEG);
  // Default: high side at +X (along length) → rotate later if highSide differs.
  // Simpler: build with high side at +Y (north in OBB-local) and pick the right rotation.
  // We'll build with high side at +Y (which is +width direction).
  const z0 = eave;
  const z1 = eave + rise;
  // Top sloped face (north high → south low)
  const top: V3[] = [
    [-halfL, -halfW, z0],
    [halfL, -halfW, z0],
    [halfL, halfW, z1],
    [-halfL, halfW, z1],
  ];
  const faces: LocalFace[] = [{ role: 'main', ring: top }];
  // Triangular end walls (E and W)
  faces.push(
    {
      role: 'gable_end_wall',
      ring: [
        [halfL, -halfW, z0],
        [halfL, halfW, z0],
        [halfL, halfW, z1],
      ],
    },
    {
      role: 'gable_end_wall',
      ring: [
        [-halfL, halfW, z0],
        [-halfL, -halfW, z0],
        [-halfL, halfW, z1],
      ],
    },
  );
  // Rotate the whole thing to put the high side at the requested cardinal.
  const targetRot = highSideToRotation(highSide);
  return targetRot === 0 ? faces : faces.map((f) => ({ role: f.role, ring: f.ring.map((p) => rotateZ(p, targetRot)) }));
}

function highSideToRotation(highSide: 'N' | 'E' | 'S' | 'W' | number): number {
  // Built with high side at +Y (north). Rotate to align with requested side.
  if (typeof highSide === 'number') return ((highSide - 0) * DEG); // user gave bearing
  switch (highSide) {
    case 'N': return 0;
    case 'E': return -Math.PI / 2;
    case 'S': return Math.PI;
    case 'W': return Math.PI / 2;
  }
}

function rotateZ(p: V3, rad: number): V3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

function gable({ halfL, halfW, eave }: GeneratorInput, pitch: number): LocalFace[] {
  // Ridge runs along the +X axis (the long axis).
  const rise = halfW * Math.tan(pitch * DEG);
  const z0 = eave;
  const z1 = eave + rise;
  // North-facing main face (positive-Y side slopes down toward +Y)
  const north: V3[] = [
    [-halfL, 0, z1],
    [halfL, 0, z1],
    [halfL, halfW, z0],
    [-halfL, halfW, z0],
  ];
  const south: V3[] = [
    [-halfL, -halfW, z0],
    [halfL, -halfW, z0],
    [halfL, 0, z1],
    [-halfL, 0, z1],
  ];
  // Triangular gable end walls (E and W)
  const east: V3[] = [
    [halfL, -halfW, z0],
    [halfL, halfW, z0],
    [halfL, 0, z1],
  ];
  const west: V3[] = [
    [-halfL, halfW, z0],
    [-halfL, -halfW, z0],
    [-halfL, 0, z1],
  ];
  return [
    { role: 'main', ring: north },
    { role: 'main', ring: south },
    { role: 'gable_end_wall', ring: east },
    { role: 'gable_end_wall', ring: west },
  ];
}

function hip({ halfL, halfW, eave }: GeneratorInput, pitch: number): LocalFace[] {
  // For a uniform-pitch hip on a rectangle, ridge length = (L - W).
  // Ridge runs along +X. Height above eave = halfW * tan(pitch).
  if (halfW >= halfL) {
    // Square / wider-than-long: collapse to a pyramid.
    return pyramid({ halfL, halfW, eave }, pitch);
  }
  const rise = halfW * Math.tan(pitch * DEG);
  const z0 = eave;
  const z1 = eave + rise;
  const ridgeHalf = halfL - halfW;
  // North main face (trapezoid)
  const north: V3[] = [
    [-ridgeHalf, 0, z1],
    [ridgeHalf, 0, z1],
    [halfL, halfW, z0],
    [-halfL, halfW, z0],
  ];
  const south: V3[] = [
    [-halfL, -halfW, z0],
    [halfL, -halfW, z0],
    [ridgeHalf, 0, z1],
    [-ridgeHalf, 0, z1],
  ];
  const east: V3[] = [
    [halfL, -halfW, z0],
    [halfL, halfW, z0],
    [ridgeHalf, 0, z1],
  ];
  const west: V3[] = [
    [-halfL, halfW, z0],
    [-halfL, -halfW, z0],
    [-ridgeHalf, 0, z1],
  ];
  return [
    { role: 'main', ring: north },
    { role: 'main', ring: south },
    { role: 'hip_end', ring: east },
    { role: 'hip_end', ring: west },
  ];
}

function dutchHip({ halfL, halfW, eave }: GeneratorInput, pitch: number, hipRatio: number): LocalFace[] {
  const rise = halfW * Math.tan(pitch * DEG);
  const z0 = eave;
  const z1 = eave + rise;
  // Ridge length is reduced by 2*hipPart at each end.
  const hipPart = Math.min(halfL * 0.45, halfW * hipRatio * 2);
  const ridgeHalf = Math.max(0.1, halfL - hipPart);
  // North/south main faces start as gable but with hipped clipped ends.
  const north: V3[] = [
    [-ridgeHalf, 0, z1],
    [ridgeHalf, 0, z1],
    [halfL, halfW, z0],
    [-halfL, halfW, z0],
  ];
  const south: V3[] = [
    [-halfL, -halfW, z0],
    [halfL, -halfW, z0],
    [ridgeHalf, 0, z1],
    [-ridgeHalf, 0, z1],
  ];
  // Hip ends: triangle from ridge endpoint down to eave at each end.
  const east: V3[] = [
    [halfL, -halfW, z0],
    [halfL, halfW, z0],
    [ridgeHalf, 0, z1],
  ];
  const west: V3[] = [
    [-halfL, halfW, z0],
    [-halfL, -halfW, z0],
    [-ridgeHalf, 0, z1],
  ];
  return [
    { role: 'main', ring: north },
    { role: 'main', ring: south },
    { role: 'hip_end', ring: east },
    { role: 'hip_end', ring: west },
  ];
}

function gambrel({ halfL, halfW, eave }: GeneratorInput, lower: number, upper: number, breakH: number): LocalFace[] {
  // Lower slopes from eave up & in to break-height, upper slopes to ridge.
  const z0 = eave;
  const z1 = eave + breakH;
  const lowerRun = breakH / Math.tan(lower * DEG);
  const breakY = halfW - lowerRun;
  if (breakY <= 0.05) return gable({ halfL, halfW, eave }, lower);
  const upperRise = breakY * Math.tan(upper * DEG);
  const z2 = z1 + upperRise;
  const faces: LocalFace[] = [];
  // North lower
  faces.push({
    role: 'gambrel_lower',
    ring: [
      [-halfL, breakY, z1],
      [halfL, breakY, z1],
      [halfL, halfW, z0],
      [-halfL, halfW, z0],
    ],
  });
  // South lower
  faces.push({
    role: 'gambrel_lower',
    ring: [
      [-halfL, -halfW, z0],
      [halfL, -halfW, z0],
      [halfL, -breakY, z1],
      [-halfL, -breakY, z1],
    ],
  });
  // North upper
  faces.push({
    role: 'gambrel_upper',
    ring: [
      [-halfL, 0, z2],
      [halfL, 0, z2],
      [halfL, breakY, z1],
      [-halfL, breakY, z1],
    ],
  });
  // South upper
  faces.push({
    role: 'gambrel_upper',
    ring: [
      [-halfL, -breakY, z1],
      [halfL, -breakY, z1],
      [halfL, 0, z2],
      [-halfL, 0, z2],
    ],
  });
  // End walls (pentagonal)
  faces.push({
    role: 'gable_end_wall',
    ring: [
      [halfL, -halfW, z0],
      [halfL, halfW, z0],
      [halfL, breakY, z1],
      [halfL, 0, z2],
      [halfL, -breakY, z1],
    ],
  });
  faces.push({
    role: 'gable_end_wall',
    ring: [
      [-halfL, halfW, z0],
      [-halfL, -halfW, z0],
      [-halfL, -breakY, z1],
      [-halfL, 0, z2],
      [-halfL, breakY, z1],
    ],
  });
  return faces;
}

function mansard({ halfL, halfW, eave }: GeneratorInput, lower: number, upper: number, breakH: number): LocalFace[] {
  // Like gambrel but hipped — lower slopes on all 4 sides, upper roof is a small flat or low-pitch hip.
  const z0 = eave;
  const z1 = eave + breakH;
  const lowerRun = breakH / Math.tan(lower * DEG);
  const innerL = Math.max(0.1, halfL - lowerRun);
  const innerW = Math.max(0.1, halfW - lowerRun);
  const faces: LocalFace[] = [];
  // 4 lower trapezoids
  faces.push({
    role: 'mansard_lower',
    ring: [
      [-innerL, innerW, z1],
      [innerL, innerW, z1],
      [halfL, halfW, z0],
      [-halfL, halfW, z0],
    ],
  });
  faces.push({
    role: 'mansard_lower',
    ring: [
      [-halfL, -halfW, z0],
      [halfL, -halfW, z0],
      [innerL, -innerW, z1],
      [-innerL, -innerW, z1],
    ],
  });
  faces.push({
    role: 'mansard_lower',
    ring: [
      [halfL, -halfW, z0],
      [halfL, halfW, z0],
      [innerL, innerW, z1],
      [innerL, -innerW, z1],
    ],
  });
  faces.push({
    role: 'mansard_lower',
    ring: [
      [-halfL, halfW, z0],
      [-halfL, -halfW, z0],
      [-innerL, -innerW, z1],
      [-innerL, innerW, z1],
    ],
  });
  // Upper hip (or near-flat with low pitch).
  const innerRise = innerW * Math.tan(upper * DEG);
  const z2 = z1 + innerRise;
  const upperRidge = Math.max(0, innerL - innerW);
  // 4 upper faces (mini-hip)
  faces.push({
    role: 'mansard_upper',
    ring: [
      [-upperRidge, 0, z2],
      [upperRidge, 0, z2],
      [innerL, innerW, z1],
      [-innerL, innerW, z1],
    ],
  });
  faces.push({
    role: 'mansard_upper',
    ring: [
      [-innerL, -innerW, z1],
      [innerL, -innerW, z1],
      [upperRidge, 0, z2],
      [-upperRidge, 0, z2],
    ],
  });
  faces.push({
    role: 'mansard_upper',
    ring: [
      [innerL, -innerW, z1],
      [innerL, innerW, z1],
      [upperRidge, 0, z2],
    ],
  });
  faces.push({
    role: 'mansard_upper',
    ring: [
      [-innerL, innerW, z1],
      [-innerL, -innerW, z1],
      [-upperRidge, 0, z2],
    ],
  });
  return faces;
}

function saltbox({ halfL, halfW, eave }: GeneratorInput, front: number, back: number, offsetPct: number): LocalFace[] {
  const z0 = eave;
  // Move ridge in Y by offsetPct (between -100 and +100 → -halfW..+halfW range).
  const ridgeY = (offsetPct / 100) * halfW * 0.9;
  // Heights of each slope from their own eave to ridge.
  const frontHalf = halfW + ridgeY; // distance from south eave to ridge
  const backHalf = halfW - ridgeY; // distance from north eave to ridge
  const frontRise = Math.min(frontHalf, halfW) * Math.tan(front * DEG);
  const backRise = Math.min(backHalf, halfW) * Math.tan(back * DEG);
  const z1 = eave + Math.max(frontRise, backRise);
  // We'll force both slopes to meet at z1 — recompute by picking max ridge height.
  const northFace: V3[] = [
    [-halfL, ridgeY, z1],
    [halfL, ridgeY, z1],
    [halfL, halfW, z0],
    [-halfL, halfW, z0],
  ];
  const southFace: V3[] = [
    [-halfL, -halfW, z0],
    [halfL, -halfW, z0],
    [halfL, ridgeY, z1],
    [-halfL, ridgeY, z1],
  ];
  const east: V3[] = [
    [halfL, -halfW, z0],
    [halfL, halfW, z0],
    [halfL, ridgeY, z1],
  ];
  const west: V3[] = [
    [-halfL, halfW, z0],
    [-halfL, -halfW, z0],
    [-halfL, ridgeY, z1],
  ];
  return [
    { role: 'main', ring: northFace },
    { role: 'main', ring: southFace },
    { role: 'gable_end_wall', ring: east },
    { role: 'gable_end_wall', ring: west },
  ];
}

function sawtooth({ halfL, halfW, eave }: GeneratorInput, count: number, pitch: number, glazingW: number): LocalFace[] {
  count = Math.max(2, Math.floor(count));
  const totalSpan = 2 * halfL;
  const bayWidth = totalSpan / count;
  const faces: LocalFace[] = [];
  for (let i = 0; i < count; i++) {
    const x0 = -halfL + i * bayWidth;
    const x1 = x0 + bayWidth - glazingW;
    const x2 = x0 + bayWidth;
    const rise = bayWidth * Math.tan(pitch * DEG);
    const zLow = eave;
    const zHigh = eave + rise;
    // Pitch face slopes from low (x0) to high (x1), running across full width.
    faces.push({
      role: 'sawtooth_pitch',
      ring: [
        [x0, -halfW, zLow],
        [x1, -halfW, zHigh],
        [x1, halfW, zHigh],
        [x0, halfW, zLow],
      ],
    });
    // Glazing strip (near-vertical band facing -X / north).
    faces.push({
      role: 'sawtooth_glazing',
      ring: [
        [x1, -halfW, zHigh],
        [x2, -halfW, zLow],
        [x2, halfW, zLow],
        [x1, halfW, zHigh],
      ],
    });
  }
  return faces;
}

function butterfly({ halfL, halfW, eave }: GeneratorInput, pitch: number, valleyDepth: number): LocalFace[] {
  // Two faces that meet at a valley in the centre. Valley sits below eaves.
  // For visual interest, the eaves are at z = eave + (halfW * tan(pitch))/2,
  // and the valley is at z = eave + that height - valleyDepth.
  const halfRise = halfW * Math.tan(pitch * DEG);
  const eaveTop = eave + halfRise;
  const valleyZ = Math.max(eave - valleyDepth, eave - halfRise);
  const north: V3[] = [
    [-halfL, 0, valleyZ],
    [halfL, 0, valleyZ],
    [halfL, halfW, eaveTop],
    [-halfL, halfW, eaveTop],
  ];
  const south: V3[] = [
    [-halfL, -halfW, eaveTop],
    [halfL, -halfW, eaveTop],
    [halfL, 0, valleyZ],
    [-halfL, 0, valleyZ],
  ];
  return [
    { role: 'main', ring: north },
    { role: 'main', ring: south },
  ];
}

function pyramid({ halfL, halfW, eave }: GeneratorInput, pitch: number): LocalFace[] {
  const halfMin = Math.min(halfL, halfW);
  const rise = halfMin * Math.tan(pitch * DEG);
  const apex: V3 = [0, 0, eave + rise];
  return [
    { role: 'main', ring: [[-halfL, halfW, eave], [halfL, halfW, eave], apex] },
    { role: 'main', ring: [[halfL, -halfW, eave], [-halfL, -halfW, eave], apex] },
    { role: 'hip_end', ring: [[halfL, halfW, eave], [halfL, -halfW, eave], apex] },
    { role: 'hip_end', ring: [[-halfL, -halfW, eave], [-halfL, halfW, eave], apex] },
  ];
}

function crossGabled({ halfL, halfW, eave }: GeneratorInput, pitch: number): LocalFace[] {
  // Simplified — render as a primary gable plus a transverse gable at the
  // mid-point. True L-shape support waits for straight-skeleton.
  const main = gable({ halfL, halfW, eave }, pitch);
  // Transverse: build a smaller gable rotated 90° at the centre, then add.
  const cross = gable({ halfL: halfW, halfW: halfL * 0.3, eave }, pitch).map((f) => ({
    role: f.role,
    ring: f.ring.map((p) => rotateZ(p, Math.PI / 2)),
  }));
  return [...main, ...cross];
}
