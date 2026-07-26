import type { Shape } from '../model/shapeTypes';
import type { Tool as ToolName } from '../state/uiStore';
import type { ShapeCapabilities } from '../shapes/shapeDefinition';
import type { ShapeRegistry } from '../shapes/shapeRegistry';
import type { ToolRegistry } from '../tools/toolRegistry';

/**
 * Which properties-panel sections are relevant for the current selection / armed
 * tool — asks each selected shape's definition (or the armed tool's, when nothing
 * is selected) for its capabilities, so a new shape/tool needs no panel edit.
 * Shared by both the React and Angular shells so the rule can't drift between them.
 */
export function panelFlags(
    toolRegistry: ToolRegistry,
    shapeRegistry: ShapeRegistry,
    tool: ToolName,
    selected: Shape[],
): ShapeCapabilities {
    if (selected.length === 0) return toolRegistry.get(tool).panelCapabilities;
    return selected.reduce<ShapeCapabilities>(
        (acc, s) => {
            const c = shapeRegistry.getDefinition(s).capabilities;
            return {
                stroke: acc.stroke || c.stroke,
                fill: acc.fill || c.fill,
                width: acc.width || c.width,
                ends: acc.ends || c.ends,
                note: acc.note || c.note,
                text: acc.text || c.text,
                edges: acc.edges || c.edges,
                strokeStyle: acc.strokeStyle || c.strokeStyle,
                fillStyle: acc.fillStyle || c.fillStyle,
                sloppiness: acc.sloppiness || c.sloppiness,
                label: acc.label || c.label,
                textAlign: acc.textAlign || c.textAlign,
                textVAlign: acc.textVAlign || c.textVAlign,
            };
        },
        { stroke: false, fill: false, width: false, ends: false, note: false, text: false, edges: false, strokeStyle: false, fillStyle: false, sloppiness: false, label: false, textAlign: false, textVAlign: false },
    );
}
