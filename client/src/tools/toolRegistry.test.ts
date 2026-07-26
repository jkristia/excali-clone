import { describe, expect, it } from 'vitest';
import { ToolRegistry } from './toolRegistry';
import { SelectTool } from './selectTool';
import { DrawTool } from './drawTool';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Font } from '../model/shapeTypes';

describe('ToolRegistry', () => {
    it('get returns the tool instance for a given name', () => {
        const registry = new ToolRegistry(new ShapeRegistry());
        expect(registry.get('select')).toBeInstanceOf(SelectTool);
        expect(registry.get('draw')).toBeInstanceOf(DrawTool);
    });

    it('line tool defaultStyle forces both caps to none', () => {
        const registry = new ToolRegistry(new ShapeRegistry());
        const style = { stroke: '#000', fill: '#fff', strokeWidth: 2, strokeStyle: 'solid', fillStyle: 'solid', opacity: 1, fontSize: 18, fontFamily: Font.Font1, hAlign: 'left', vAlign: 'middle', noteFill: '#fff', startCap: 'arrow', endCap: 'arrow', edges: 'sharp' } as const;
        const patch = registry.get('line').defaultStyle?.(style);
        expect(patch).toMatchObject({ startCap: 'none', endCap: 'none' });
    });

    it('arrow tool defaultStyle forces start none / end arrow', () => {
        const registry = new ToolRegistry(new ShapeRegistry());
        const style = { stroke: '#000', fill: '#fff', strokeWidth: 2, strokeStyle: 'solid', fillStyle: 'solid', opacity: 1, fontSize: 18, fontFamily: Font.Font1, hAlign: 'left', vAlign: 'middle', noteFill: '#fff', startCap: 'arrow', endCap: 'none', edges: 'sharp' } as const;
        const patch = registry.get('arrow').defaultStyle?.(style);
        expect(patch).toMatchObject({ startCap: 'none', endCap: 'arrow' });
    });
});
