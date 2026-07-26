import type { Color, CornerStyle, EndpointCap, FillStyle, Sloppiness, StrokeStyle, TextAlign, VerticalAlign } from '../model/shapeTypes';

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

/** Seed values for the 7 MRU slots on a fresh browser / short stored list.
 *  Index-aligned: `DEFAULT_RECENT_FILL[i]` is the tint of `DEFAULT_RECENT_STROKE[i]`. */
export const DEFAULT_RECENT_STROKE: readonly Color[] = ['#e03131', '#f08c00', '#2f9e44', '#1971c2', '#6741d9', '#c2255c', '#495057'];
export const DEFAULT_RECENT_FILL: readonly Color[] = ['#ffc9c9', '#ffec99', '#b2f2bb', '#a5d8ff', '#d0bfff', '#fcc2d7', '#ced4da'];

/** Cap on the flyout's shared custom-color row. Unlike the MRU quick slots this list
 *  has no seeds — the row stays hidden until the user picks a color from the OS picker. */
export const CUSTOM_SLOT_COUNT = 8;

/** Flyout palette, row-major over an 8-column grid: 2 rows saturated, then 2 rows pastel.
 *  Hue-ordered red → pink, then brown/neutrals. `PALETTE_PASTEL[i]` is the tint of
 *  `PALETTE_SOLID[i]` — keep them index-aligned when hand-swapping values.
 *  Values are drawn from the Open Color palette (https://yeun.github.io/open-color/). */
export const PALETTE_SOLID: readonly Color[] = [
    '#e03131', '#f76707', '#f08c00', '#fab005', '#74b816', '#2f9e44', '#099268', '#0c8599',
    '#1971c2', '#3b5bdb', '#6741d9', '#9c36b5', '#c2255c', '#846358', '#495057', '#868e96',
];
export const PALETTE_PASTEL: readonly Color[] = [
    '#ffc9c9', '#ffd8a8', '#ffe8cc', '#ffec99', '#d8f5a2', '#b2f2bb', '#96f2d7', '#99e9f2',
    '#a5d8ff', '#bac8ff', '#d0bfff', '#eebefa', '#fcc2d7', '#e6d8ce', '#ced4da', '#f1f3f5',
];
/** The flyout's greyscale row: one 8-column ramp, almost black → almost white. Not
 *  tint-paired with the two rows above — it stands alone as its own row. Also from
 *  Open Color's `gray` scale, which leans slightly blue (B > G > R) by design rather
 *  than true r=g=b neutral, so it doesn't look flat next to the saturated rows.
 *  https://yeun.github.io/open-color/
 * */
export const PALETTE_NEUTRAL: readonly Color[] = [
    '#212529', '#495057', '#6c757d', '#868e96', '#adb5bd', '#ced4da', '#e9ecef', '#f8f9fa',
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

/** RoughJS tuning per sloppiness level. `roughness: 0` renders an exact (non-sketchy)
 *  line — {@link RoughDraw} also disables multi-stroke passes at that level so a
 *  translucent shape isn't double-darkened by two coincident strokes. Tune these
 *  values to adjust how "hand-drawn" each level looks. */
export const SLOPPINESS: { value: Sloppiness; label: string; icon: string; roughness: number; bowing: number }[] = [
    { value: 'plain', label: 'Plain', icon: '▁', roughness: 0, bowing: 0 },
    { value: 'light', label: 'Light', icon: '∼', roughness: 0.8, bowing: 1.1 },
    { value: 'medium', label: 'Medium', icon: '≈', roughness: 1.6, bowing: 1.3 },
];

/** Hachure/cross-hatch line spacing and angle, shared by every RoughJS fill style
 *  so switching sloppiness doesn't also shift the fill pattern's look. */
export const HACHURE_GAP = 8;
export const HACHURE_ANGLE = -41;
