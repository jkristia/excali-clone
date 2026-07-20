import type { Camera } from '../state/uiStore';
import type { Bounds, PeerPresence, Shape } from '../model/types';
import { CameraMath } from './camera';
import { Handles } from '../util/handles';
import { RotationMath } from '../util/rotationMath';
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
}

export class SceneRenderer {
    private static readonly GRID_SIZE = 40;
    private static readonly GRID_COLOR = 'rgba(0,0,0,0.08)';
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

        this.drawGrid(ctx, width, height, camera);

        // World-space transform.
        ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
        ctx.scale(camera.zoom, camera.zoom);

        for (const shape of input.shapes) {
            if (shape.id === input.editingId) continue; // rendered by the inline editor
            this.drawShape(ctx, shape);
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
        const step = SceneRenderer.GRID_SIZE * cam.zoom;
        if (step < 8) return; // too dense to be useful
        const topLeft = CameraMath.screenToWorld(0, 0, cam);
        const startX = Math.floor(topLeft.x / SceneRenderer.GRID_SIZE) * SceneRenderer.GRID_SIZE;
        const startY = Math.floor(topLeft.y / SceneRenderer.GRID_SIZE) * SceneRenderer.GRID_SIZE;

        ctx.fillStyle = SceneRenderer.GRID_COLOR;
        for (let wx = startX; ; wx += SceneRenderer.GRID_SIZE) {
            const sx = (wx - cam.x) * cam.zoom;
            if (sx > width) break;
            for (let wy = startY; ; wy += SceneRenderer.GRID_SIZE) {
                const sy = (wy - cam.y) * cam.zoom;
                if (sy > height) break;
                ctx.beginPath();
                ctx.arc(sx, sy, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    private drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
        ctx.save();
        this.withShapeTransform(ctx, shape, () => this.shapeRegistry.getDefinition(shape).draw(ctx, shape));
        ctx.restore();
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
        color: string,
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
