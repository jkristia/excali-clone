import type { Bounds, Shape, ShapeType } from '../model/shapeTypes';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { RotationMath } from '../util/rotationMath';
import { RectangleShapeDef } from './rectangleShapeDef';
import { EllipseShapeDef } from './ellipseShapeDef';
import { DiamondShapeDef } from './diamondShapeDef';
import { ArrowShapeDef } from './arrowShapeDef';
import { DrawShapeDef } from './drawShapeDef';
import { TextShapeDef } from './textShapeDef';
import { NoteShapeDef } from './noteShapeDef';
import { GroupShapeDef } from './groupShapeDef';

export class ShapeRegistry {
    /** The one switch: shape type -> its behavior. Add a shape by adding one entry here. */
    private readonly definitions: { [T in ShapeType]: ShapeDefinition<Extract<Shape, { type: T }>> } = {
        rectangle: new RectangleShapeDef(),
        ellipse: new EllipseShapeDef(),
        diamond: new DiamondShapeDef(),
        arrow: new ArrowShapeDef(),
        draw: new DrawShapeDef(),
        text: new TextShapeDef(),
        note: new NoteShapeDef(),
        group: new GroupShapeDef(),
    };

    public getDefinition<S extends Shape>(shape: S): ShapeDefinition<S> {
        return this.definitions[shape.type] as unknown as ShapeDefinition<S>;
    }

    public getCapabilities(type: ShapeType) {
        return this.definitions[type].capabilities;
    }

    /** Whether `type` is a registered shape type — used to validate untrusted input
     *  (e.g. shapes parsed from the OS clipboard) before treating it as a `Shape`. */
    public isKnownType(type: string): type is ShapeType {
        return Object.prototype.hasOwnProperty.call(this.definitions, type);
    }

    /** Whether the select tool shows drag-to-resize box handles for this shape. */
    public isResizable(shape: Shape): boolean {
        return this.getDefinition(shape).resizable;
    }

    /** Whether the select tool shows the rotate handle for this shape. */
    public isRotatable(shape: Shape): boolean {
        return this.getDefinition(shape).rotatable;
    }

    /** Which resize handles this shape exposes: 'x' (left/right only) or 'both' (default). */
    public resizeAxis(shape: Shape): 'both' | 'x' {
        return this.getDefinition(shape).resizeAxis ?? 'both';
    }

    /** Axis-aligned bounding box of a shape in world coordinates. */
    public getBounds(shape: Shape): Bounds {
        return this.getDefinition(shape).getBounds(shape);
    }

    /** Hit test a single shape at a world point. `tol` is in world units.
     *  For rotated shapes the point is un-rotated into the shape's local frame
     *  first, so each definition's `hitTest` stays axis-aligned. */
    public hitTest(shape: Shape, px: number, py: number, tol = 6): boolean {
        const def = this.getDefinition(shape);
        if (shape.rotation) {
            const c = RotationMath.center(def.getBounds(shape));
            ({ x: px, y: py } = RotationMath.rotatePoint(px, py, c.x, c.y, -shape.rotation));
        }
        return def.hitTest(shape, px, py, tol);
    }

    /** Return the topmost shape hit at the given world point. `shapes` is expected
     *  in draw order (as `readAllShapes` returns it), so the last hit is on top —
     *  `z` alone is no longer comparable across different group parents. */
    public topShapeAt(shapes: Shape[], px: number, py: number): Shape | null {
        let best: Shape | null = null;
        for (const s of shapes) {
            if (this.hitTest(s, px, py)) best = s;
        }
        return best;
    }

    public shapesInRect(shapes: Shape[], sel: Bounds): Shape[] {
        const n = Geometry.normalizeRect(sel.x, sel.y, sel.w, sel.h);
        return shapes.filter((s) => {
            if (s.type === 'group') return false; // groups have no bounds; selected via members
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
