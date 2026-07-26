import type {
    ArrowShape,
    DiamondShape,
    DrawShape,
    EllipseShape,
    GroupShape,
    NoteShape,
    RectShape,
    TextShape,
} from '../model/shapeTypes';

/** Shared shape factories for specs. Each returns a valid shape with sensible defaults,
 *  overridable per test. File-level functions are allowed here (test-support). */

export function rect(over: Partial<RectShape> = {}): RectShape {
    return {
        id: 'r1', type: 'rectangle', x: 10, y: 10, z: 1, createdBy: 'u',
        w: 20, h: 20, fill: '#fff', stroke: '#000', strokeWidth: 2,
        ...over,
    };
}

export function ellipse(over: Partial<EllipseShape> = {}): EllipseShape {
    return {
        id: 'e1', type: 'ellipse', x: 0, y: 0, z: 1, createdBy: 'u',
        w: 40, h: 20, fill: '#fff', stroke: '#000', strokeWidth: 2,
        ...over,
    };
}

export function diamond(over: Partial<DiamondShape> = {}): DiamondShape {
    return {
        id: 'dm1', type: 'diamond', x: 0, y: 0, z: 1, createdBy: 'u',
        w: 40, h: 40, fill: '#fff', stroke: '#000', strokeWidth: 2,
        ...over,
    };
}

export function note(over: Partial<NoteShape> = {}): NoteShape {
    return {
        id: 'n1', type: 'note', x: 5, y: 5, z: 1, createdBy: 'u',
        w: 100, h: 80, text: '', fill: '#ff0', textOptions: { fontSize: 14, hAlign: 'left' },
        ...over,
    };
}

export function text(over: Partial<TextShape> = {}): TextShape {
    return {
        id: 't1', type: 'text', x: 0, y: 0, z: 1, createdBy: 'u',
        text: 'hi', color: '#000', textOptions: { fontSize: 18, hAlign: 'left' }, w: 20, h: 25,
        ...over,
    };
}

export function arrow(over: Partial<ArrowShape> = {}): ArrowShape {
    return {
        id: 'a1', type: 'arrow', x: 0, y: 0, z: 1, createdBy: 'u',
        dx: 30, dy: 0, stroke: '#000', strokeWidth: 2,
        startCap: 'none', endCap: 'arrow',
        ...over,
    };
}

export function draw(over: Partial<DrawShape> = {}): DrawShape {
    return {
        id: 'd1', type: 'draw', x: 0, y: 0, z: 1, createdBy: 'u',
        points: [0, 0, 10, 10, 20, 0], stroke: '#000', strokeWidth: 2,
        ...over,
    };
}

export function group(over: Partial<GroupShape> = {}): GroupShape {
    return {
        id: 'g1', type: 'group', x: 0, y: 0, z: 1, createdBy: 'u',
        ...over,
    };
}
