// Default Roof config for each style + display helpers (label, thumbnail SVG).

import type { Roof, RoofStyle } from '@nza-pv/shared';

export function defaultRoofForStyle(style: RoofStyle, previous?: Roof): Roof {
  const carryPitch =
    previous && 'pitch_deg' in previous && typeof previous.pitch_deg === 'number'
      ? previous.pitch_deg
      : 30;
  switch (style) {
    case 'flat':
      return { style: 'flat', parapet_height_m: 0.3 };
    case 'mono':
      return { style: 'mono', pitch_deg: carryPitch, high_side: 'S' };
    case 'gable':
      return { style: 'gable', pitch_deg: carryPitch, ridge_axis: 'longest' };
    case 'hip':
      return { style: 'hip', pitch_deg: carryPitch };
    case 'dutch_hip':
      return { style: 'dutch_hip', pitch_deg: carryPitch, ridge_axis: 'longest', hip_ratio: 0.25 };
    case 'gambrel':
      return {
        style: 'gambrel',
        lower_pitch_deg: 60,
        upper_pitch_deg: 25,
        break_height_m: 2.0,
        ridge_axis: 'longest',
      };
    case 'mansard':
      return {
        style: 'mansard',
        lower_pitch_deg: 70,
        upper_pitch_deg: 15,
        break_height_m: 2.5,
        ridge_axis: 'longest',
      };
    case 'saltbox':
      return {
        style: 'saltbox',
        front_pitch_deg: 35,
        back_pitch_deg: 25,
        ridge_offset_pct: 20,
        ridge_axis: 'longest',
      };
    case 'sawtooth':
      return { style: 'sawtooth', pitch_count: 3, pitch_deg: 25, glazing_strip_width_m: 0.6 };
    case 'butterfly':
      return { style: 'butterfly', pitch_deg: 15, valley_depth_m: 0.8 };
    case 'pyramid':
      return { style: 'pyramid', pitch_deg: carryPitch };
    case 'cross_gabled':
      return { style: 'cross_gabled', pitch_deg: carryPitch };
    case 'parallel_gables':
      return { style: 'parallel_gables', pitch_count: 3, pitch_deg: 30 };
  }
}

export function presetLabel(style: RoofStyle): string {
  return LABELS[style];
}

const LABELS: Record<RoofStyle, string> = {
  flat: 'Flat',
  mono: 'Mono',
  gable: 'Gable',
  hip: 'Hip',
  dutch_hip: 'Dutch hip',
  gambrel: 'Gambrel',
  mansard: 'Mansard',
  saltbox: 'Saltbox',
  sawtooth: 'Sawtooth',
  parallel_gables: 'M-roof',
  butterfly: 'Butterfly',
  pyramid: 'Pyramid',
  cross_gabled: 'Cross gabled',
};

const WALL = '#d6cfc6';
const ROOF = '#5d4f43';
const RIDGE = '#2b231d';
const STROKE = '#1b1411';

function svg(body: string): string {
  return `<svg viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'>${body}</svg>`;
}

/** Tiny SVG glyphs (60×60) for the preset gallery — schematic, not realistic. */
export function presetThumbnail(style: RoofStyle): string {
  switch (style) {
    case 'flat':
      return svg(
        `<rect x='10' y='28' width='40' height='22' fill='${WALL}' stroke='${STROKE}'/>` +
          `<rect x='8' y='26' width='44' height='4' fill='${ROOF}' stroke='${STROKE}'/>`,
      );
    case 'mono':
      return svg(
        `<polygon points='10,50 50,50 50,18 10,30' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='10,30 50,18 50,14 8,28' fill='${ROOF}' stroke='${STROKE}'/>`,
      );
    case 'gable':
      return svg(
        `<rect x='10' y='28' width='40' height='22' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='8,30 30,12 52,30' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<line x1='30' y1='12' x2='30' y2='30' stroke='${RIDGE}' stroke-width='1.5'/>`,
      );
    case 'hip':
      return svg(
        `<rect x='10' y='28' width='40' height='22' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='10,30 50,30 38,18 22,18' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<line x1='22' y1='18' x2='38' y2='18' stroke='${RIDGE}' stroke-width='1.5'/>`,
      );
    case 'dutch_hip':
      return svg(
        `<rect x='10' y='30' width='40' height='20' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='10,30 50,30 44,20 16,20' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<polygon points='16,20 44,20 44,14 16,14' fill='${WALL}' stroke='${STROKE}'/>`,
      );
    case 'gambrel':
      return svg(
        `<rect x='10' y='38' width='40' height='12' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='8,38 14,28 30,18 46,28 52,38' fill='${ROOF}' stroke='${STROKE}'/>`,
      );
    case 'mansard':
      return svg(
        `<rect x='12' y='40' width='36' height='10' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='12,40 16,28 44,28 48,40' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<polygon points='16,28 30,22 44,28' fill='${ROOF}' stroke='${STROKE}'/>`,
      );
    case 'saltbox':
      return svg(
        `<rect x='10' y='30' width='40' height='20' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='8,30 22,16 52,30' fill='${ROOF}' stroke='${STROKE}'/>`,
      );
    case 'sawtooth':
      return svg(
        `<rect x='6' y='40' width='48' height='10' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='6,40 22,18 22,40' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<polygon points='22,40 38,18 38,40' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<polygon points='38,40 54,18 54,40' fill='${ROOF}' stroke='${STROKE}'/>`,
      );
    case 'butterfly':
      return svg(
        `<rect x='10' y='30' width='40' height='20' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='8,18 30,30 52,18 52,30 8,30' fill='${ROOF}' stroke='${STROKE}'/>`,
      );
    case 'pyramid':
      return svg(
        `<rect x='12' y='30' width='36' height='20' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='12,30 48,30 30,12' fill='${ROOF}' stroke='${STROKE}'/>`,
      );
    case 'cross_gabled':
      return svg(
        `<rect x='12' y='28' width='36' height='22' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='8,30 30,14 52,30' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<polygon points='22,38 30,22 38,38' fill='${ROOF}' stroke='${STROKE}'/>`,
      );
    case 'parallel_gables':
      // Three full A-frame gables in a row — like sawtooth but symmetric peaks.
      return svg(
        `<rect x='6' y='40' width='48' height='10' fill='${WALL}' stroke='${STROKE}'/>` +
          `<polygon points='6,40 14,24 22,40' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<polygon points='22,40 30,24 38,40' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<polygon points='38,40 46,24 54,40' fill='${ROOF}' stroke='${STROKE}'/>` +
          `<line x1='14' y1='24' x2='14' y2='40' stroke='${RIDGE}' stroke-width='1'/>` +
          `<line x1='30' y1='24' x2='30' y2='40' stroke='${RIDGE}' stroke-width='1'/>` +
          `<line x1='46' y1='24' x2='46' y2='40' stroke='${RIDGE}' stroke-width='1'/>`,
      );
  }
}
