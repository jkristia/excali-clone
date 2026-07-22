import { beforeEach, describe, expect, it } from 'vitest';
import { UIStore, type Style } from './uiStore';
import { ToolRegistry } from '../tools/toolRegistry';
import { ShapeRegistry } from '../shapes/shapeRegistry';

let uiStore: UIStore;
let initialStyle: Style;

beforeEach(() => {
    uiStore = new UIStore(new ToolRegistry(new ShapeRegistry()));
    initialStyle = uiStore.getInitialState().style;
});

describe('setTool applies each tool\'s defaultStyle', () => {
    it('line tool forces both caps to none', () => {
        uiStore.getState().setTool('line');
        expect(uiStore.getState().style).toMatchObject({ startCap: 'none', endCap: 'none' });
    });

    it('arrow tool forces start none / end arrow', () => {
        uiStore.getState().setTool('arrow');
        expect(uiStore.getState().style).toMatchObject({ startCap: 'none', endCap: 'arrow' });
    });

    it('other tools leave style untouched', () => {
        uiStore.getState().setTool('rectangle');
        expect(uiStore.getState().style).toEqual(initialStyle);
    });

    it('always clears editingId', () => {
        uiStore.setState({ editingId: 'x1' });
        uiStore.getState().setTool('select');
        expect(uiStore.getState().editingId).toBeNull();
    });

    it('always clears editingGroupId', () => {
        uiStore.setState({ editingGroupId: 'g1' });
        uiStore.getState().setTool('select');
        expect(uiStore.getState().editingGroupId).toBeNull();
    });
});

describe('editingCaret (where the inline editor opens its caret)', () => {
    it('defaults to null (select-all)', () => {
        expect(uiStore.getState().editingCaret).toBeNull();
    });

    it('setEditing carries a caret point for click-to-edit', () => {
        uiStore.getState().setEditing('t1', { x: 12, y: 34 });
        expect(uiStore.getState().editingId).toBe('t1');
        expect(uiStore.getState().editingCaret).toEqual({ x: 12, y: 34 });
    });

    it('setEditing defaults the caret to null (double-click select-all)', () => {
        uiStore.getState().setEditing('t1', { x: 12, y: 34 });
        uiStore.getState().setEditing('t1');
        expect(uiStore.getState().editingCaret).toBeNull();
    });

    it('activateEditing clears any stale caret so a new shape selects-all', () => {
        uiStore.getState().setEditing('t1', { x: 12, y: 34 });
        uiStore.getState().activateEditing('t2');
        expect(uiStore.getState().editingId).toBe('t2');
        expect(uiStore.getState().editingCaret).toBeNull();
    });
});

describe('editingGroupId (entered group scope)', () => {
    it('defaults to null', () => {
        expect(uiStore.getState().editingGroupId).toBeNull();
    });

    it('setEditingGroup enters and exits the scope', () => {
        uiStore.getState().setEditingGroup('g1');
        expect(uiStore.getState().editingGroupId).toBe('g1');
        uiStore.getState().setEditingGroup(null);
        expect(uiStore.getState().editingGroupId).toBeNull();
    });

    it('clearSelection also exits the entered group', () => {
        uiStore.getState().setEditingGroup('g1');
        uiStore.getState().clearSelection();
        expect(uiStore.getState().editingGroupId).toBeNull();
    });
});

describe('snapToGrid', () => {
    it('defaults to false', () => {
        expect(uiStore.getState().snapToGrid).toBe(false);
    });

    it('toggleSnapToGrid flips the flag', () => {
        uiStore.getState().toggleSnapToGrid();
        expect(uiStore.getState().snapToGrid).toBe(true);
        uiStore.getState().toggleSnapToGrid();
        expect(uiStore.getState().snapToGrid).toBe(false);
    });

    it('setSnapToGrid sets it explicitly', () => {
        uiStore.getState().setSnapToGrid(true);
        expect(uiStore.getState().snapToGrid).toBe(true);
    });
});

describe('toggleSelection', () => {
    it('non-additive: replaces selection with just the given id', () => {
        uiStore.setState({ selection: ['a', 'b'] });
        uiStore.getState().toggleSelection('c', false);
        expect(uiStore.getState().selection).toEqual(['c']);
    });

    it('additive: adds id if not already selected', () => {
        uiStore.setState({ selection: ['a'] });
        uiStore.getState().toggleSelection('b', true);
        expect(uiStore.getState().selection).toEqual(['a', 'b']);
    });

    it('additive: removes id if already selected', () => {
        uiStore.setState({ selection: ['a', 'b'] });
        uiStore.getState().toggleSelection('a', true);
        expect(uiStore.getState().selection).toEqual(['b']);
    });
});
