import type { Tool } from '../state/uiStore';

export interface ToolDef {
    tool: Tool;
    label: string;
    icon: string;
    /** Single-letter keyboard shortcut, shown in toolbar tooltips and consumed by KeyboardController. */
    key: string;
}

/** Single source of truth for tool metadata: label/icon for the toolbar UI and the
 * keyboard shortcut for both the tooltip text and KeyboardController's key map. */
export const TOOL_DEFS: ToolDef[] = [
    { tool: 'select', label: 'Select', icon: '⬚', key: 'V' },
    { tool: 'pan', label: 'Pan (or hold Space)', icon: '✋', key: 'H' },
    { tool: 'rectangle', label: 'Rectangle', icon: '▭', key: 'R' },
    { tool: 'ellipse', label: 'Ellipse', icon: '◯', key: 'O' },
    { tool: 'line', label: 'Line', icon: '╱', key: 'L' },
    { tool: 'arrow', label: 'Arrow', icon: '↗', key: 'A' },
    { tool: 'draw', label: 'Draw', icon: '✎', key: 'P' },
    { tool: 'text', label: 'Text', icon: 'T', key: 'T' },
    { tool: 'note', label: 'Sticky note', icon: '▢', key: 'N' },
];
