import { nanoid } from 'nanoid';
import type { Shape } from '../model/types';
import { UIStore } from '../state/uiStore';
import { CanvasDocument } from '../document/canvasDocument';
import { ShapeRegistry } from '../shapes/shapeRegistry';

/**
 * In-memory copy/paste of shapes. Framework-agnostic (like the other
 * `interaction/` controllers) so the same behavior works under any shell — the
 * view layer only supplies the paste anchor (mouse position in world coords).
 *
 * This is a private, per-session clipboard, not the OS clipboard: `copy` snapshots
 * the current selection and `paste` drops fresh-id clones with the group's center
 * placed at the anchor. Pasting repeatedly at the same anchor intentionally stacks.
 */
export class ClipboardController {
    private contents: Shape[] = [];

    constructor(
        private readonly uiStore: UIStore,
        private readonly canvasDocument: CanvasDocument,
        private readonly shapeRegistry: ShapeRegistry,
        private readonly author: () => string,
    ) {}

    /** Snapshot the current selection into the clipboard. A no-op keeps the previous
     *  contents if nothing is selected, so an accidental empty copy doesn't clear it. */
    public copy(): void {
        const shapes = this.selectedShapes();
        if (shapes.length) this.contents = shapes;
    }

    public hasContents(): boolean {
        return this.contents.length > 0;
    }

    /**
     * Paste clones of the clipboard so the group's bounds-center lands at
     * (centerX, centerY) in world coords, stacked on top with new ids. Relative
     * offsets and z-order within the group are preserved. The pasted shapes become
     * the new selection.
     */
    public paste(centerX: number, centerY: number): void {
        if (this.contents.length === 0) return;
        const bounds = this.shapeRegistry.unionBounds(this.contents);
        if (!bounds) return;

        const dx = centerX - (bounds.x + bounds.w / 2);
        const dy = centerY - (bounds.y + bounds.h / 2);
        this.addClones(this.contents, dx, dy);
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
}
