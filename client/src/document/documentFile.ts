import type { BaseShape, Shape } from '../model/types';
import type { Camera } from '../state/uiStore';
import { ShapeRegistry } from '../shapes/shapeRegistry';

/** Tag on the file envelope so a foreign JSON file isn't mis-read as a board. */
const FILE_KIND = 'whiteboard/document';
/** Bumped when the on-disk shape changes. Deserialize stays tolerant of missing
 *  optional fields so older files keep loading. */
const FILE_VERSION = '0.01';

/** The view a client was looking at when it saved — restored locally on load. */
export interface WhiteboardView {
    camera: Camera;
    snapToGrid: boolean;
}

export interface WhiteboardFile {
    kind: typeof FILE_KIND;
    version: string;
    shapes: Shape[];
    view?: WhiteboardView;
}

/**
 * Codec for the save-to-file format. Distinct from the clipboard envelope
 * (`whiteboard/shapes@1`): a file is a whole-board snapshot that also carries the
 * saver's view (pan/zoom + grid) so loading re-frames what they were looking at.
 * Framework-agnostic — the Angular shell handles the actual file download/open.
 */
export class DocumentFile {
    constructor(private readonly shapeRegistry: ShapeRegistry) {}

    /** Serialize a board to the versioned envelope, pretty-printed for a readable file. */
    public serialize(shapes: Shape[], view: WhiteboardView): string {
        const file: WhiteboardFile = { kind: FILE_KIND, version: FILE_VERSION, shapes, view };
        return JSON.stringify(file, null, 2);
    }

    /** Parse and validate file text. Returns null (never throws) for anything that
     *  isn't one of our files, so the caller can ignore a wrong/garbage file. `view`
     *  is optional — an older or view-less file loads with the board only. */
    public deserialize(text: string): WhiteboardFile | null {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            return null;
        }
        if (typeof parsed !== 'object' || parsed === null) return null;
        const file = parsed as Record<string, unknown>;
        if (file['kind'] !== FILE_KIND || typeof file['version'] !== 'string') return null;
        if (!Array.isArray(file['shapes']) || !file['shapes'].every((s) => this.isValidShape(s))) return null;

        const view = this.readView(file['view']);
        return {
            kind: FILE_KIND,
            version: file['version'],
            shapes: file['shapes'] as Shape[],
            ...(view ? { view } : {}),
        };
    }

    /** Best-effort view guard — a malformed `view` is dropped rather than failing the
     *  whole load, since the board is the essential payload. Fields are named through the
     *  `WhiteboardView`/`Camera` types (as in {@link isValidShape}), so renaming one breaks
     *  this at compile time. */
    private readView(value: unknown): WhiteboardView | undefined {
        if (typeof value !== 'object' || value === null) return undefined;
        const view = value as Partial<WhiteboardView>;
        const rawCamera: unknown = view.camera;
        if (typeof rawCamera !== 'object' || rawCamera === null) return undefined;
        const camera = rawCamera as Partial<Camera>;
        if (
            typeof camera.x !== 'number' ||
            typeof camera.y !== 'number' ||
            typeof camera.zoom !== 'number' ||
            typeof view.snapToGrid !== 'boolean'
        ) {
            return undefined;
        }
        return {
            camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
            snapToGrid: view.snapToGrid,
        };
    }

    /** Lightweight structural guard — type-specific fields are trusted (same policy as the
     *  clipboard). Only the shared base fields plus a *registered* `type` are checked.
     *
     *  Viewing the candidate as a `Partial<BaseShape>` lets us name the fields through the
     *  model itself (`shape.id`, not `shape['id']`), so renaming a field in `BaseShape`
     *  breaks this at compile time rather than silently drifting. The `typeof` checks still
     *  run at runtime — the cast only supplies the property names, not any trust. */
    private isValidShape(value: unknown): value is Shape {
        if (typeof value !== 'object' || value === null) return false;
        const shape = value as Partial<BaseShape>;
        return (
            typeof shape.id === 'string' &&
            typeof shape.type === 'string' &&
            this.shapeRegistry.isKnownType(shape.type) &&
            typeof shape.x === 'number' &&
            typeof shape.y === 'number' &&
            typeof shape.z === 'number'
        );
    }
}
