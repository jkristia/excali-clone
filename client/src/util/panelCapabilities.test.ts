import { describe, expect, it } from 'vitest';
import { panelFlags } from './panelCapabilities';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { ToolRegistry } from '../tools/toolRegistry';
import type { Shape } from '../model/shapeTypes';

function rect(id: string): Shape {
    return { id, type: 'rectangle', x: 0, y: 0, z: 0, w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 1, createdBy: 'x' };
}
function note(id: string): Shape {
    return { id, type: 'note', x: 0, y: 0, z: 0, w: 10, h: 10, fill: '#fff', text: '', textOptions: { fontSize: 14, hAlign: 'left' }, createdBy: 'x' };
}

const shapeRegistry = new ShapeRegistry();
const toolRegistry = new ToolRegistry(shapeRegistry);

describe('panelFlags', () => {
    it('empty selection: reads the armed tool\'s panelCapabilities', () => {
        expect(panelFlags(toolRegistry, shapeRegistry, 'note', [])).toEqual({ stroke: false, fill: false, width: false, ends: false, note: true, text: true, textAlign: true, textVAlign: true });
    });

    it('with selection: unions capabilities across all selected shapes', () => {
        const flags = panelFlags(toolRegistry, shapeRegistry, 'select', [rect('a'), note('b')]);
        expect(flags).toEqual({ stroke: true, fill: true, width: true, ends: false, note: true, text: true, edges: true, strokeStyle: true, fillStyle: true, sloppiness: true, label: true, textAlign: true, textVAlign: true });
    });

    it('label capability: on for captionable shapes, off for a note-only selection', () => {
        expect(panelFlags(toolRegistry, shapeRegistry, 'select', [rect('a')]).label).toBe(true);
        expect(panelFlags(toolRegistry, shapeRegistry, 'select', [note('b')]).label).toBeFalsy();
    });
});
