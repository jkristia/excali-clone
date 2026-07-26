import type { Shape } from '../model/shapeTypes';
import type { Style } from '../state/uiStore';
import type { Interaction, PointerInfo } from '../interaction/interaction';
import type { Tool, ToolContext } from './tool';
import type { ShapeCapabilities } from '../shapes/shapeDefinition';

/**
 * Drag-to-create tool for shapes with a zero-size draft at pointer-down that grows as
 * the pointer moves (rectangle/ellipse/arrow/line). Parameterized by a draft factory
 * since each shape type's initial fields differ — no ShapeDefinition method needed for
 * this since it's tool behavior, not shape behavior.
 */
export class CreateShapeTool implements Tool {
    constructor(
        private readonly makeDraft: (ctx: ToolContext, p: PointerInfo, id: string, z: number) => Shape,
        readonly panelCapabilities: ShapeCapabilities,
        readonly defaultStyle?: (style: Style) => Partial<Style>,
    ) { }

    public onPointerDown(ctx: ToolContext, p: PointerInfo): Interaction {
        const draft = this.makeDraft(ctx, p, ctx.newId(), ctx.nextZ());
        return { kind: 'create', draft, startX: p.x, startY: p.y };
    }
}
