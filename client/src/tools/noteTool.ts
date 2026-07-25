import type { Shape } from '../model/types';
import type { Interaction, PointerInfo } from '../interaction/interaction';
import type { Tool, ToolContext } from './tool';
import type { ShapeCapabilities } from '../shapes/shapeDefinition';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { NOTE_MIN_HEIGHT } from '../shapes/noteShapeDef';
import { TextOptionsUtil } from '../util/textOptions';

/** Note has no drag-to-create — click places a fixed-size sticky note and enters inline editing. */
export class NoteTool implements Tool {
    public readonly panelCapabilities: ShapeCapabilities;

    constructor(shapeRegistry: ShapeRegistry) {
        this.panelCapabilities = shapeRegistry.getCapabilities('note');
    }

    public onPointerDown(ctx: ToolContext, p: PointerInfo): Interaction | null {
        const style = ctx.style();
        const id = ctx.newId();
        const shape: Shape = {
            id, type: 'note', x: p.x, y: p.y, z: ctx.nextZ(), createdBy: ctx.author(),
            w: 180, h: NOTE_MIN_HEIGHT, text: '', fill: style.noteFill,
            textOptions: TextOptionsUtil.fromStyle(style),
        };
        ctx.addShape(shape);
        ctx.setSelection([id]);
        ctx.activateEditing(id);
        return null;
    }
}
