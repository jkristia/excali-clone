import type { Shape } from '../model/types';
import type { Interaction, PointerInfo } from '../interaction/interaction';
import type { Tool, ToolContext } from './tool';
import type { ShapeCapabilities } from '../shapes/shapeDefinition';
import { ShapeRegistry } from '../shapes/shapeRegistry';

export class DrawTool implements Tool {
    public readonly panelCapabilities: ShapeCapabilities;

    constructor(shapeRegistry: ShapeRegistry) {
        this.panelCapabilities = shapeRegistry.getCapabilities('draw');
    }

    public onPointerDown(ctx: ToolContext, p: PointerInfo): Interaction {
        const style = ctx.style();
        const draft: Extract<Shape, { type: 'draw' }> = {
            id: ctx.newId(), type: 'draw', x: p.x, y: p.y, z: ctx.nextZ(), createdBy: ctx.author(),
            points: [0, 0], stroke: style.stroke, strokeWidth: style.strokeWidth, strokeStyle: style.strokeStyle,
        };
        return { kind: 'draw', draft, startX: p.x, startY: p.y };
    }
}
