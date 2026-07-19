import type { Bounds, Shape, ShapeType } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { RectangleShapeDef } from './rectangleShapeDef';
import { EllipseShapeDef } from './ellipseShapeDef';
import { ArrowShapeDef } from './arrowShapeDef';
import { DrawShapeDef } from './drawShapeDef';
import { TextShapeDef } from './textShapeDef';
import { NoteShapeDef } from './noteShapeDef';

export class ShapeRegistry {
    /** The one switch: shape type -> its behavior. Add a shape by adding one entry here. */
    private readonly definitions: { [T in ShapeType]: ShapeDefinition<Extract<Shape, { type: T }>> } = {
        rectangle: new RectangleShapeDef(),
        ellipse: new EllipseShapeDef(),
        arrow: new ArrowShapeDef(),
        draw: new DrawShapeDef(),
        text: new TextShapeDef(),
        note: new NoteShapeDef(),
    };

    public getDefinition<S extends Shape>(shape: S): ShapeDefinition<S> {
        return this.definitions[shape.type] as unknown as ShapeDefinition<S>;
    }

    public getCapabilities(type: ShapeType) {
        return this.definitions[type].capabilities;
    }

    /** Whether the select tool shows drag-to-resize box handles for this shape. */
    public isResizable(shape: Shape): boolean {
        return this.getDefinition(shape).resizable;
    }

    /** Axis-aligned bounding box of a shape in world coordinates. */
    public getBounds(shape: Shape): Bounds {
        return this.getDefinition(shape).getBounds(shape);
    }

    /** Hit test a single shape at a world point. `tol` is in world units. */
    public hitTest(shape: Shape, px: number, py: number, tol = 6): boolean {
        return this.getDefinition(shape).hitTest(shape, px, py, tol);
    }

    /** Return the topmost shape (highest z) hit at the given world point. */
    public topShapeAt(shapes: Shape[], px: number, py: number): Shape | null {
        let best: Shape | null = null;
        for (const s of shapes) {
            if (this.hitTest(s, px, py)) {
                if (!best || s.z > best.z) best = s;
            }
        }
        return best;
    }

    public shapesInRect(shapes: Shape[], sel: Bounds): Shape[] {
        const n = Geometry.normalizeRect(sel.x, sel.y, sel.w, sel.h);
        return shapes.filter((s) => {
            const b = this.getBounds(s);
            return b.x >= n.x && b.y >= n.y && b.x + b.w <= n.x + n.w && b.y + b.h <= n.y + n.h;
        });
    }

    /** Bounding box that contains all given shapes, or null for an empty list. */
    public unionBounds(shapes: Shape[]): Bounds | null {
        if (shapes.length === 0) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const s of shapes) {
            const b = this.getBounds(s);
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.w);
            maxY = Math.max(maxY, b.y + b.h);
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
}
