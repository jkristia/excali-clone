import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardController } from './keyboardController';
import { UIStore } from '../state/uiStore';
import { ToolRegistry } from '../tools/toolRegistry';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import type { CanvasDocument } from '../document/canvasDocument';

const canvasDocument = {
    undoManager: { undo: vi.fn(), redo: vi.fn() },
    reorderShapes: vi.fn(),
} as unknown as CanvasDocument;

const uiStore = new UIStore(new ToolRegistry(new ShapeRegistry()));
const keyboard = new KeyboardController(uiStore, canvasDocument, () => false);

function fakeEvent(init: Partial<KeyboardEvent> & { key: string }) {
    return {
        key: init.key,
        ctrlKey: init.ctrlKey ?? false,
        metaKey: init.metaKey ?? false,
        shiftKey: init.shiftKey ?? false,
        target: init.target ?? null,
        preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
}

function fire(init: Partial<KeyboardEvent> & { key: string }) {
    const e = fakeEvent(init);
    keyboard.handleKeyDown(e);
    return e.preventDefault as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
    uiStore.setState({ ...uiStore.getInitialState() }, true);
    vi.clearAllMocks();
});

describe('KeyboardController', () => {
    it('maps a bare shortcut letter to setTool', () => {
        fire({ key: 'r' });
        expect(uiStore.getState().tool).toBe('rectangle');
    });

    it('ignores shortcuts while typing', () => {
        const typingKeyboard = new KeyboardController(uiStore, canvasDocument, () => true);
        typingKeyboard.handleKeyDown(fakeEvent({ key: 'r' }));
        expect(uiStore.getState().tool).toBe('select');
    });

    it('Ctrl+Z undoes', () => {
        const pd = fire({ key: 'z', ctrlKey: true });
        expect(canvasDocument.undoManager.undo).toHaveBeenCalled();
        expect(pd).toHaveBeenCalled();
    });

    it('Ctrl+Shift+Z redoes', () => {
        fire({ key: 'z', ctrlKey: true, shiftKey: true });
        expect(canvasDocument.undoManager.redo).toHaveBeenCalled();
    });

    it('Ctrl+] reorders forward when a shape is selected', () => {
        uiStore.setState({ selection: ['a'] });
        fire({ key: ']', ctrlKey: true });
        expect(canvasDocument.reorderShapes).toHaveBeenCalledWith(['a'], 'forward');
    });

    it('Ctrl+] is a no-op with no selection', () => {
        fire({ key: ']', ctrlKey: true });
        expect(canvasDocument.reorderShapes).not.toHaveBeenCalled();
    });

    it("Ctrl+' toggles snap-to-grid", () => {
        expect(uiStore.getState().snapToGrid).toBe(false);
        const pd = fire({ key: "'", ctrlKey: true });
        expect(uiStore.getState().snapToGrid).toBe(true);
        expect(pd).toHaveBeenCalled();
        fire({ key: "'", ctrlKey: true });
        expect(uiStore.getState().snapToGrid).toBe(false);
    });

    it("Ctrl+' is ignored while typing", () => {
        const typingKeyboard = new KeyboardController(uiStore, canvasDocument, () => true);
        typingKeyboard.handleKeyDown(fakeEvent({ key: "'", ctrlKey: true }));
        expect(uiStore.getState().snapToGrid).toBe(false);
    });
});
