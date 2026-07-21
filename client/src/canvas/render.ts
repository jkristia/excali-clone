import type { Camera } from '../state/uiStore';
import type { Bounds, Color, PeerPresence, Shape } from '../model/types';
import { CameraMath } from './camera';
import { Handles } from '../util/handles';
import { RotationMath } from '../util/rotationMath';
import { GridMath } from '../util/gridMath';
import { CanvasDraw } from '../util/canvasDraw';
import { ShapeRegistry } from '../shapes/shapeRegistry';

export interface RenderInput {
    ctx: CanvasRenderingContext2D;
    width: number; // CSS px
    height: number;
    dpr: number;
    camera: Camera;
    shapes: Shape[];
    selection: string[];
    peers: PeerPresence[];
    /** in-progress marquee selection rect (world coords), if any. */
    marquee: Bounds | null;
    /** shape being drawn/created this frame but not yet committed. */
    draft: Shape | null;
    /** id of the text/note being edited inline — hidden on the canvas so the
   *  live <textarea> overlay is the only thing drawn (no offset ghost). */
    editingId: string | null;
    /** draw the snap-to-grid line grid (only while snap mode is enabled). */
    showGrid: boolean;
}

export class SceneRenderer {
    private static readonly GRID_MINOR_COLOR = 'rgba(0,0,0,0.06)';
    private static readonly GRID_MAJOR_COLOR = 'rgba(0,0,0,0.14)';
    private static readonly SELECT_COLOR = '#4263eb';
    private static readonly HANDLE_SIZE = 8;

    constructor(private readonly shapeRegistry: ShapeRegistry) {}

    public render(input: RenderInput): void {
        const { ctx, width, height, dpr, camera } = input;

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, width, height);

        if (input.showGrid) this.drawGrid(ctx, width, height, camera);

        // World-space transform.
        ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
        ctx.scale(camera.zoom, camera.zoom);

        for (const shape of input.shapes) {
            const editing = shape.id === input.editingId;
            // Text/note bodies are fully replaced by the inline <textarea>; other shapes
            // keep their body while caption-editing and only suppress the caption.
            if (editing && (shape.type === 'text' || shape.type === 'note')) continue;
            this.drawShape(ctx, shape, editing);
        }
        if (input.draft) this.drawShape(ctx, input.draft);

        // Peer selections (highlight what others are editing).
        const selById = new Map<string, Shape>();
        for (const s of input.shapes) selById.set(s.id, s);
        for (const peer of input.peers) {
            for (const id of peer.selection) {
                const s = selById.get(id);
                if (s) this.withShapeTransform(ctx, s, () => this.drawOutline(ctx, this.shapeRegistry.getBounds(s), peer.user.color, camera.zoom, 4));
            }
        }

        // Local selection with handles.
        const selected = input.selection.map((id) => selById.get(id)).filter(Boolean) as Shape[];
        for (const s of selected) {
            if (s.id === input.editingId) continue; // no selection rect while inline-editing
            this.withShapeTransform(ctx, s, () => this.drawOutline(ctx, this.shapeRegistry.getBounds(s), SceneRenderer.SELECT_COLOR, camera.zoom, 2));
        }
        // Dotted bounding box around the whole selection (no handles yet).
        if (selected.length > 1) {
            const group = this.shapeRegistry.unionBounds(selected);
            if (group) this.drawSelectionBox(ctx, group, camera.zoom);
        }
        if (selected.length === 1 && selected[0].id !== input.editingId) {
            const s = selected[0];
            if (s.type === 'arrow') {
                this.drawArrowHandles(ctx, s.x, s.y, s.x + s.dx, s.y + s.dy, camera.zoom);
            } else {
                this.withShapeTransform(ctx, s, () => {
                    const b = this.shapeRegistry.getBounds(s);
                    if (this.shapeRegistry.isResizable(s)) this.drawHandles(ctx, b, camera.zoom);
                    if (this.shapeRegistry.isRotatable(s)) this.drawRotateHandle(ctx, b, camera.zoom);
                });
            }
        }

        if (input.marquee) this.drawMarquee(ctx, input.marquee, camera.zoom);

        ctx.restore();
    }

    private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, cam: Camera): void {
        const minorPx = GridMath.MINOR * cam.zoom;
        if (minorPx * GridMath.DIVISIONS < 4) return; // even the major lines are too dense
        if (minorPx >= 6) this.drawGridLines(ctx, width, height, cam, false); // dashed sub-lines
        this.drawGridLines(ctx, width, height, cam, true); // solid major lines
    }

    /**
     * One pass of grid lines: `major` draws the solid every-`DIVISIONS` lines, else the
     * dashed sub-lines in between. Drawn in screen space with a constant 1px width so the
     * grid never thickens with zoom.
     */
    private drawGridLines(ctx: CanvasRenderingContext2D, width: number, height: number, cam: Camera, major: boolean): void {
        ctx.save();
        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = major ? SceneRenderer.GRID_MAJOR_COLOR : SceneRenderer.GRID_MINOR_COLOR;
        ctx.setLineDash(major ? [] : [2, 3]);

        const topLeft = CameraMath.screenToWorld(0, 0, cam);
        for (let ix = Math.floor(topLeft.x / GridMath.MINOR); ; ix++) {
            const sx = (ix * GridMath.MINOR - cam.x) * cam.zoom;
            if (sx > width) break;
            if (SceneRenderer.isMajorIndex(ix) !== major) continue;
            const x = Math.round(sx) + 0.5;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }
        for (let iy = Math.floor(topLeft.y / GridMath.MINOR); ; iy++) {
            const sy = (iy * GridMath.MINOR - cam.y) * cam.zoom;
            if (sy > height) break;
            if (SceneRenderer.isMajorIndex(iy) !== major) continue;
            const y = Math.round(sy) + 0.5;
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }

        ctx.stroke();
        ctx.restore();
    }

    private static isMajorIndex(index: number): boolean {
        return (((index % GridMath.DIVISIONS) + GridMath.DIVISIONS) % GridMath.DIVISIONS) === 0;
    }

    private drawShape(ctx: CanvasRenderingContext2D, shape: Shape, hideLabel = false): void {
        ctx.save();
        // Scoped to this shape by the surrounding save/restore, so it resets for the next
        // shape and never touches the selection/handle chrome drawn outside this bracket.
        ctx.globalAlpha = shape.opacity ?? 1;
        this.withShapeTransform(ctx, shape, () => {
            this.shapeRegistry.getDefinition(shape).draw(ctx, shape);
            if (!hideLabel) this.drawLabel(ctx, shape);
        });
        ctx.restore();
    }

    /** Draw the optional caption centered over the shape. Box shapes wrap to their bounds;
     *  arrow/draw get a background pill on the midpoint. Text/note carry their own text and
     *  are excluded. Drawn inside {@link withShapeTransform} so it inherits opacity/rotation. */
    private drawLabel(ctx: CanvasRenderingContext2D, shape: Shape): void {
        if (!shape.label || shape.type === 'text' || shape.type === 'note') return;
        const pill = shape.type === 'arrow' || shape.type === 'draw';
        CanvasDraw.drawCenteredLabel(
            ctx, shape.label, this.shapeRegistry.getBounds(shape), shape.labelFontSize ?? 16,
            pill, shape.labelHAlign ?? 'center', shape.labelVAlign ?? 'middle',
        );
    }

    /** Run `fn` with the canvas rotated about the shape's bounds center, so the
     *  shape and its selection chrome draw in one shared local frame. No-op (and
     *  no save/restore) when the shape is unrotated. */
    private withShapeTransform(ctx: CanvasRenderingContext2D, shape: Shape, fn: () => void): void {
        const rot = shape.rotation ?? 0;
        if (!rot) {
            fn();
            return;
        }
        const c = RotationMath.center(this.shapeRegistry.getBounds(shape));
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(rot);
        ctx.translate(-c.x, -c.y);
        fn();
        ctx.restore();
    }

    private drawOutline(
        ctx: CanvasRenderingContext2D,
        b: Bounds,
        color: Color,
        zoom: number,
        padScreen: number,
    ): void {
        const pad = padScreen / zoom;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([]);
        ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
        ctx.restore();
    }

    private drawArrowHandles(
        ctx: CanvasRenderingContext2D,
        x1: number, y1: number,
        x2: number, y2: number,
        zoom: number,
    ): void {
        const r = SceneRenderer.HANDLE_SIZE / 2 / zoom;
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = SceneRenderer.SELECT_COLOR;
        ctx.lineWidth = 1.5 / zoom;
        for (const [px, py] of [[x1, y1], [x2, y2]] as [number, number][]) {
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    private drawHandles(ctx: CanvasRenderingContext2D, b: Bounds, zoom: number): void {
        const s = SceneRenderer.HANDLE_SIZE / zoom;
        const pts = Handles.points(b);
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = SceneRenderer.SELECT_COLOR;
        ctx.lineWidth = 1.5 / zoom;
        for (const [px, py] of pts) {
            ctx.beginPath();
            ctx.rect(px - s / 2, py - s / 2, s, s);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    private drawRotateHandle(ctx: CanvasRenderingContext2D, b: Bounds, zoom: number): void {
        const r = SceneRenderer.HANDLE_SIZE / 2 / zoom;
        const offset = Handles.ROTATE_OFFSET / zoom;
        const [hx, hy] = Handles.rotateHandlePoint(b, offset);
        ctx.save();
        ctx.strokeStyle = SceneRenderer.SELECT_COLOR;
        ctx.fillStyle = '#fff';
        ctx.lineWidth = 1.5 / zoom;
        // Connector from the top-edge midpoint up to the handle.
        ctx.beginPath();
        ctx.moveTo(b.x + b.w / 2, b.y);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    /** Dashed rectangle around a multi-selection's combined bounds, padded slightly so it
     *  sits just outside the shapes. No fill, no resize/rotate handles. */
    private drawSelectionBox(ctx: CanvasRenderingContext2D, b: Bounds, zoom: number): void {
        const pad = 4 / zoom;
        ctx.save();
        ctx.strokeStyle = SceneRenderer.SELECT_COLOR;
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
        ctx.restore();
    }

    private drawMarquee(ctx: CanvasRenderingContext2D, b: Bounds, zoom: number): void {
        ctx.save();
        ctx.fillStyle = 'rgba(66,99,235,0.08)';
        ctx.strokeStyle = SceneRenderer.SELECT_COLOR;
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.restore();
    }
}
