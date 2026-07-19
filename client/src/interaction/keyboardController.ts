import { UIStore, type Tool } from '../state/uiStore';
import { CanvasDocument, type ReorderOp } from '../document/canvasDocument';

const SHORTCUTS: Record<string, Tool> = {
    v: 'select',
    h: 'pan',
    r: 'rectangle',
    o: 'ellipse',
    l: 'line',
    a: 'arrow',
    p: 'draw',
    x: 'text',
    n: 'note',
};

/**
 * Shortcut -> command map, extracted from App.tsx so it's testable and reusable
 * without React (the Angular shell wires the same `handleKeyDown` to its own
 * `window.addEventListener`).
 */
export class KeyboardController {
    /** @param isTyping Returns true when the key should be treated as text input
   * (focused textarea/input) rather than a shortcut. An open inline editor
   * (`uiStore.editingId`) is treated as typing too, handled here. */
    constructor(
        private readonly uiStore: UIStore,
        private readonly canvasDocument: CanvasDocument,
        private readonly isTyping: (target: EventTarget | null) => boolean,
    ) {}

    public handleKeyDown(e: KeyboardEvent): void {
        const typing = this.isTyping(e.target) || this.uiStore.getState().editingId !== null;

        // Undo / redo work everywhere.
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) this.canvasDocument.undoManager.redo();
            else this.canvasDocument.undoManager.undo();
            return;
        }
        if (mod && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            this.canvasDocument.undoManager.redo();
            return;
        }

        // Layer / z-order shortcuts (match Excalidraw).
        if (mod && (e.key === ']' || e.key === '[')) {
            e.preventDefault();
            const sel = this.uiStore.getState().selection;
            if (sel.length) {
                const op: ReorderOp =
                    e.key === ']'
                        ? e.shiftKey
                            ? 'toFront'
                            : 'forward'
                        : e.shiftKey
                            ? 'toBack'
                            : 'backward';
                this.canvasDocument.reorderShapes(sel, op);
            }
            return;
        }

        if (typing || mod) return;
        const tool = SHORTCUTS[e.key.toLowerCase()];
        if (tool) this.uiStore.getState().setTool(tool);
    }
}

export function defaultIsTyping(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT';
}
