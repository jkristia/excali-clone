import { nanoid } from 'nanoid';
import type { Shape } from '../model/types';
import { UIStore } from '../state/uiStore';
import { CanvasDocument } from '../document/canvasDocument';
import { ShapeRegistry } from '../shapes/shapeRegistry';

/** Tag on the clipboard envelope so pasted text from other apps isn't mis-read as shapes. */
const CLIPBOARD_KIND = 'whiteboard/shapes@1';

interface ClipboardPayload {
    kind: typeof CLIPBOARD_KIND;
    shapes: Shape[];
}

/**
 * Copy/paste of shapes, backed by the OS clipboard so a copy in one tab/window can
 * be pasted into another instance of the app. Framework-agnostic (like the other
 * `interaction/` controllers) so the same behavior works under any shell — the view
 * layer only supplies the paste anchor (mouse position in world coords).
 *
 * `copy` snapshots the selection into an in-memory buffer *and* writes a tagged JSON
 * envelope to the OS clipboard. `paste` prefers the OS clipboard (enabling cross-tab
 * paste) and falls back to the in-memory buffer when the clipboard is unavailable,
 * denied, or holds foreign text — so same-tab and offline paste always keep working.
 * Pasted shapes are fresh-id clones with the group's center placed at the anchor;
 * pasting repeatedly at the same anchor intentionally stacks.
 */
export class ClipboardController {
    private contents: Shape[] = [];

    constructor(
        private readonly uiStore: UIStore,
        private readonly canvasDocument: CanvasDocument,
        private readonly shapeRegistry: ShapeRegistry,
        private readonly author: () => string,
    ) {}

    /** Snapshot the current selection into the in-memory buffer and mirror it to the OS
     *  clipboard. A no-op keeps the previous contents if nothing is selected, so an
     *  accidental empty copy doesn't clear it. */
    public async copy(): Promise<void> {
        const shapes = this.selectedShapes();
        if (!shapes.length) return;
        this.contents = shapes;
        await this.writeClipboard(shapes);
    }

    public hasContents(): boolean {
        return this.contents.length > 0;
    }

    /**
     * Paste clones so the group's bounds-center lands at (centerX, centerY) in world
     * coords, stacked on top with new ids. Relative offsets and z-order within the group
     * are preserved. The pasted shapes become the new selection. Shapes come from the OS
     * clipboard when it holds our envelope (cross-tab), otherwise the in-memory buffer.
     */
    public async paste(centerX: number, centerY: number): Promise<void> {
        const source = (await this.readClipboard()) ?? this.contents;
        if (source.length === 0) return;
        const bounds = this.shapeRegistry.unionBounds(source);
        if (!bounds) return;

        const dx = centerX - (bounds.x + bounds.w / 2);
        const dy = centerY - (bounds.y + bounds.h / 2);
        this.addClones(source, dx, dy);
    }

    /**
     * Duplicate the current selection in place, offset by (dx, dy) in world coords.
     * Unlike paste, this reads the live selection (not the clipboard buffer), so
     * duplicating never disturbs what the user has copied. Because the clones become
     * the new selection, repeated duplicates cascade by (dx, dy) each time.
     */
    public duplicate(dx: number, dy: number): void {
        const shapes = this.selectedShapes();
        if (shapes.length === 0) return;
        this.addClones(shapes, dx, dy);
    }

    /** Clone shapes onto the top of the stack with fresh ids, offset by (dx, dy),
     *  add them to the document, and make them the selection. */
    private addClones(shapes: Shape[], dx: number, dy: number): void {
        const author = this.author();
        const baseZ = this.canvasDocument.topZ();

        const clones = shapes
            .slice()
            .sort((a, b) => a.z - b.z)
            .map((shape, index) => ({
                ...shape,
                id: nanoid(),
                x: shape.x + dx,
                y: shape.y + dy,
                z: baseZ + 1 + index,
                createdBy: author,
            }));

        this.canvasDocument.addShapes(clones);
        this.uiStore.getState().setSelection(clones.map((s) => s.id));
    }

    private selectedShapes(): Shape[] {
        const out: Shape[] = [];
        for (const id of this.uiStore.getState().selection) {
            const shape = this.canvasDocument.getShape(id);
            if (shape) out.push(shape);
        }
        return out;
    }

    /** Best-effort mirror of the copied shapes to the OS clipboard. A missing/denied
     *  clipboard must not throw — the in-memory buffer remains the source of truth. */
    private async writeClipboard(shapes: Shape[]): Promise<void> {
        const clipboard = this.clipboard();
        if (!clipboard) return;
        const payload: ClipboardPayload = { kind: CLIPBOARD_KIND, shapes };
        try {
            await clipboard.writeText(JSON.stringify(payload));
        } catch {
            /* clipboard write unavailable/denied — fall back to the in-memory buffer */
        }
    }

    /** Shapes from the OS clipboard when it holds our envelope, else null so the caller
     *  falls back to the in-memory buffer. Never throws on unavailable/denied/foreign text. */
    private async readClipboard(): Promise<Shape[] | null> {
        const clipboard = this.clipboard();
        if (!clipboard) return null;
        try {
            const parsed: unknown = JSON.parse(await clipboard.readText());
            return this.isValidPayload(parsed) ? parsed.shapes : null;
        } catch {
            return null;
        }
    }

    private clipboard(): Clipboard | null {
        return typeof navigator !== 'undefined' && navigator.clipboard ? navigator.clipboard : null;
    }

    private isValidPayload(value: unknown): value is ClipboardPayload {
        if (typeof value !== 'object' || value === null) return false;
        const payload = value as Record<string, unknown>;
        if (payload['kind'] !== CLIPBOARD_KIND || !Array.isArray(payload['shapes'])) return false;
        return payload['shapes'].every((shape) => this.isValidShape(shape));
    }

    /** Lightweight structural guard — `addClones` re-derives ids/z, so we only need the
     *  fields geometry/rendering reads (a known `type` plus numeric anchor and z). */
    private isValidShape(value: unknown): value is Shape {
        if (typeof value !== 'object' || value === null) return false;
        const shape = value as Record<string, unknown>;
        return (
            typeof shape['id'] === 'string' &&
            typeof shape['type'] === 'string' &&
            this.shapeRegistry.isKnownType(shape['type']) &&
            typeof shape['x'] === 'number' &&
            typeof shape['y'] === 'number' &&
            typeof shape['z'] === 'number'
        );
    }
}
