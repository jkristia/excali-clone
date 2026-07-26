import type { Color, CornerStyle, EndpointCap, FillStyle, StrokeStyle, TextAlign, VerticalAlign } from '../model/types';

/** Shape drawing defaults — persisted into shape data, not CSS (canvas rendering can't consume CSS custom properties). */
export const NOTE_COLORS: Color[] = ['#fff9b1', '#d3f8e2', '#ffd6e0', '#cddafd', '#ffe8cc'];

/** Quick-slot anchors, named rather than indexed so uiStore's initial style doesn't
 *  depend on an array's ordering. */
export const TRANSPARENT: Color = 'transparent';
export const INK: Color = '#1e1e1e';

/** Always quick slots 0 and 1 in the Stroke/Fill rows; MRU promotion never displaces them. */
export const PINNED_COLORS: readonly Color[] = [TRANSPARENT, INK];
/** How many MRU slots follow the pinned pair. */
export const RECENT_SLOT_COUNT = 7;

/** Seed values for the 6 MRU slots on a fresh browser / short stored list. */
export const DEFAULT_RECENT_STROKE: readonly Color[] = ['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#6741d9', '#c2255c'];
export const DEFAULT_RECENT_FILL: readonly Color[] = ['#ffc9c9', '#ffec99', '#b2f2bb', '#a5d8ff', '#d0bfff', '#fcc2d7'];

/** Flyout palette, row-major over an 8-column grid: 2 rows saturated, then 2 rows pastel.
 *  Hue-ordered red → pink, then brown/neutrals. `PALETTE_PASTEL[i]` is the tint of
 *  `PALETTE_SOLID[i]` — keep them index-aligned when hand-swapping values. */
export const PALETTE_SOLID: readonly Color[] = [
    '#e03131', '#f76707', '#f08c00', '#fab005', '#74b816', '#2f9e44', '#099268', '#0c8599',
    '#1971c2', '#3b5bdb', '#6741d9', '#9c36b5', '#c2255c', '#846358', '#495057', '#868e96',
];
export const PALETTE_PASTEL: readonly Color[] = [
    '#ffc9c9', '#ffd8a8', '#ffe8cc', '#ffec99', '#d8f5a2', '#b2f2bb', '#96f2d7', '#99e9f2',
    '#a5d8ff', '#bac8ff', '#d0bfff', '#eebefa', '#fcc2d7', '#e6d8ce', '#ced4da', '#f1f3f5',
];
export const WIDTHS = [1, 2, 4, 8];
export const TEXT_ALIGNS: { align: TextAlign; label: string }[] = [
    { align: 'left', label: 'Left' },
    { align: 'center', label: 'Center' },
    { align: 'right', label: 'Right' },
];
export const VERTICAL_ALIGNS: { align: VerticalAlign; label: string }[] = [
    { align: 'top', label: 'Top' },
    { align: 'middle', label: 'Middle' },
    { align: 'bottom', label: 'Bottom' },
];
export const CAPS: { cap: EndpointCap; label: string; icon: string }[] = [
    { cap: 'none', label: 'None', icon: '—' },
    { cap: 'arrow', label: 'Arrowhead', icon: '➤' },
    { cap: 'circle', label: 'Circle', icon: '●' },
];
export const EDGES: { value: CornerStyle; label: string; icon: string }[] = [
    { value: 'sharp', label: 'Sharp', icon: '◾' },
    { value: 'rounded', label: 'Rounded', icon: '▢' },
];
export const STROKE_STYLES: { value: StrokeStyle; label: string; icon: string }[] = [
    { value: 'solid', label: 'Solid', icon: '—' },
    { value: 'dashed', label: 'Dashed', icon: '╌' },
    { value: 'dotted', label: 'Dotted', icon: '⋯' },
];
export const FILL_STYLES: { value: FillStyle; label: string; icon: string }[] = [
    { value: 'solid', label: 'Solid', icon: '■' },
    { value: 'hatch', label: 'Hatch', icon: '▨' },
    { value: 'crossHatch', label: 'Cross-hatch', icon: '▩' },
];
