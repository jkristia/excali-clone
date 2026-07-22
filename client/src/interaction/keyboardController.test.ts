import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardController } from './keyboardController';
import { UIStore } from '../state/uiStore';
import { ToolRegistry } from '../tools/toolRegistry';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import type { CanvasDocument } from '../document/canvasDocument';

const canvasDocument = {
    undoManager: { undo: vi.fn(), redo: vi.fn() },
    reorderShapes: vi.fn(),
    groupShapes: vi.fn(() => 'G1'),
    ungroup: vi.fn(),
} as unknown as CanvasDocument;

const uiStore = new UIStore(new ToolRegistry(new ShapeRegistry()));
const keyboard = new KeyboardController(uiStore, canvasDocument, () => false);

function fakeEvent(init: Partial<KeyboardEvent> & { key: string }) {
    return {
        key: init.key,
        code: init.code ?? '',
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
        fire({ key: ']', code: 'BracketRight', ctrlKey: true });
        expect(canvasDocument.reorderShapes).toHaveBeenCalledWith(['a'], 'forward');
    });

    it('Ctrl+[ reorders backward when a shape is selected', () => {
        uiStore.setState({ selection: ['a'] });
        fire({ key: '[', code: 'BracketLeft', ctrlKey: true });
        expect(canvasDocument.reorderShapes).toHaveBeenCalledWith(['a'], 'backward');
    });

    it('Ctrl+Shift+] brings to front (matching browser key, not just code)', () => {
        uiStore.setState({ selection: ['a'] });
        fire({ key: '}', code: 'BracketRight', ctrlKey: true, shiftKey: true });
        expect(canvasDocument.reorderShapes).toHaveBeenCalledWith(['a'], 'toFront');
    });

    it('Ctrl+Shift+[ sends to back (matching browser key, not just code)', () => {
        uiStore.setState({ selection: ['a'] });
        fire({ key: '{', code: 'BracketLeft', ctrlKey: true, shiftKey: true });
        expect(canvasDocument.reorderShapes).toHaveBeenCalledWith(['a'], 'toBack');
    });

    it('Ctrl+] is a no-op with no selection', () => {
        fire({ key: ']', code: 'BracketRight', ctrlKey: true });
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

    it('Ctrl+G groups the selection and selects the new group', () => {
        uiStore.setState({ selection: ['a', 'b'] });
        fire({ key: 'g', ctrlKey: true });
        expect(canvasDocument.groupShapes).toHaveBeenCalledWith(['a', 'b']);
        expect(uiStore.getState().selection).toEqual(['G1']);
    });

    it('Ctrl+Shift+G ungroups each selected id', () => {
        uiStore.setState({ selection: ['G1', 'G2'] });
        fire({ key: 'g', ctrlKey: true, shiftKey: true });
        expect(canvasDocument.ungroup).toHaveBeenCalledWith('G1');
        expect(canvasDocument.ungroup).toHaveBeenCalledWith('G2');
        expect(canvasDocument.groupShapes).not.toHaveBeenCalled();
    });
});
