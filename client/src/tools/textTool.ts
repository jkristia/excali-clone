import type { Shape } from '../model/types';
import type { Interaction, PointerInfo } from '../interaction/interaction';
import type { Tool, ToolContext } from './tool';
import type { ShapeCapabilities } from '../shapes/shapeDefinition';
import { TEXT_LINE_HEIGHT } from '../shapes/textShapeDef';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { TextOptionsUtil } from '../util/textOptions';

/** Text has no drag-to-create — click places an empty text shape and enters inline editing. */
export class TextTool implements Tool {
    public readonly panelCapabilities: ShapeCapabilities;

    constructor(shapeRegistry: ShapeRegistry) {
        this.panelCapabilities = shapeRegistry.getCapabilities('text');
    }

    public onPointerDown(ctx: ToolContext, p: PointerInfo): Interaction | null {
        const style = ctx.style();
        const id = ctx.newId();
        const shape: Shape = {
            id, type: 'text', x: p.x, y: p.y, z: ctx.nextZ(), createdBy: ctx.author(),
            text: '', color: style.stroke, textOptions: TextOptionsUtil.fromStyle(style),
            w: 20, h: style.fontSize * TEXT_LINE_HEIGHT,
        };
        ctx.addShape(shape);
        ctx.setSelection([id]);
        ctx.activateEditing(id);
        return null;
    }
}
