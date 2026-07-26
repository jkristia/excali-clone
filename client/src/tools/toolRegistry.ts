import type { Shape } from '../model/shapeTypes';
import type { Tool } from './tool';
import type { Tool as ToolName } from '../state/uiStore';
import { SelectTool } from './selectTool';
import { PanTool } from './panTool';
import { CreateShapeTool } from './createShapeTool';
import { DrawTool } from './drawTool';
import { TextTool } from './textTool';
import { NoteTool } from './noteTool';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { TextOptionsUtil } from '../util/textOptions';

type ArrowDraftArgs = Parameters<CreateShapeTool['onPointerDown']>;

export class ToolRegistry {
    /** The one switch: tool name -> its behavior. Add a tool by adding one entry here. */
    private readonly tools: { [T in ToolName]: Tool };

    constructor(shapeRegistry: ShapeRegistry) {
        const rectangleTool = new CreateShapeTool((ctx, p, id, z) => {
            const style = ctx.style();
            return {
                id, type: 'rectangle', x: p.x, y: p.y, z, createdBy: ctx.author(),
                w: 0, h: 0, fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, strokeStyle: style.strokeStyle, fillStyle: style.fillStyle, edges: style.edges,
                textOptions: TextOptionsUtil.fromStyle(style),
            };
        }, shapeRegistry.getCapabilities('rectangle'));

        const ellipseTool = new CreateShapeTool((ctx, p, id, z) => {
            const style = ctx.style();
            return {
                id, type: 'ellipse', x: p.x, y: p.y, z, createdBy: ctx.author(),
                w: 0, h: 0, fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, strokeStyle: style.strokeStyle, fillStyle: style.fillStyle,
                textOptions: TextOptionsUtil.fromStyle(style),
            };
        }, shapeRegistry.getCapabilities('ellipse'));

        const diamondTool = new CreateShapeTool((ctx, p, id, z) => {
            const style = ctx.style();
            return {
                id, type: 'diamond', x: p.x, y: p.y, z, createdBy: ctx.author(),
                w: 0, h: 0, fill: style.fill, stroke: style.stroke, strokeWidth: style.strokeWidth, strokeStyle: style.strokeStyle, fillStyle: style.fillStyle, edges: style.edges,
                textOptions: TextOptionsUtil.fromStyle(style),
            };
        }, shapeRegistry.getCapabilities('diamond'));

        // Line and Arrow are the same shape; caps (set from the tool's signature style
        // via defaultStyle below) are what distinguishes them.
        const lineTool = new CreateShapeTool(this.makeArrowDraft, shapeRegistry.getCapabilities('arrow'), (style) => ({
            ...style, startCap: 'none', endCap: 'none',
        }));
        const arrowTool = new CreateShapeTool(this.makeArrowDraft, shapeRegistry.getCapabilities('arrow'), (style) => ({
            ...style, startCap: 'none', endCap: 'arrow',
        }));

        this.tools = {
            select: new SelectTool(shapeRegistry),
            pan: new PanTool(),
            rectangle: rectangleTool,
            ellipse: ellipseTool,
            diamond: diamondTool,
            line: lineTool,
            arrow: arrowTool,
            draw: new DrawTool(shapeRegistry),
            text: new TextTool(shapeRegistry),
            note: new NoteTool(shapeRegistry),
        };
    }

    private makeArrowDraft(ctx: ArrowDraftArgs[0], p: ArrowDraftArgs[1], id: string, z: number): Shape {
        const style = ctx.style();
        return {
            id, type: 'arrow', x: p.x, y: p.y, z, createdBy: ctx.author(),
            dx: 0, dy: 0, stroke: style.stroke, strokeWidth: style.strokeWidth, strokeStyle: style.strokeStyle,
            startCap: style.startCap, endCap: style.endCap,
            textOptions: TextOptionsUtil.fromStyle(style),
        };
    }

    public get(name: ToolName): Tool {
        return this.tools[name];
    }
}
