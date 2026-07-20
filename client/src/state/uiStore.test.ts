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
