import type { CornerStyle, EndpointCap, TextAlign } from '../model/types';

/** Shape drawing defaults — persisted into shape data, not CSS (canvas rendering can't consume CSS custom properties). */
export const STROKE_COLORS = ['transparent', '#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#ae3ec9'];
export const FILL_COLORS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa'];
export const NOTE_COLORS = ['#fff9b1', '#d3f8e2', '#ffd6e0', '#cddafd', '#ffe8cc'];
export const WIDTHS = [1, 2, 4, 8];
export const FONT_SIZES: { size: number; label: string }[] = [
    { size: 16, label: 'S' },
    { size: 20, label: 'M' },
    { size: 28, label: 'L' },
    { size: 36, label: 'XL' },
];
export const TEXT_ALIGNS: { align: TextAlign; label: string }[] = [
    { align: 'left', label: 'Left' },
    { align: 'center', label: 'Center' },
    { align: 'right', label: 'Right' },
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
