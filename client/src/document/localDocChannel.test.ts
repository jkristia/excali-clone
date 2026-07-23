import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { FakeBroadcastChannel } from '../test-support/fakeBroadcastChannel';

vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

const { LocalDocChannel } = await import('./localDocChannel');

function shapesOf(doc: Y.Doc): string[] {
    return Array.from(doc.getMap<Y.Map<unknown>>('shapes').keys()).sort();
}

describe('LocalDocChannel', () => {
    beforeEach(() => FakeBroadcastChannel.reset());
    afterEach(() => FakeBroadcastChannel.reset());

    it('relays a local edit to another tab on the same board', () => {
        const a = new Y.Doc();
        const b = new Y.Doc();
        const ca = new LocalDocChannel('local', a);
        const cb = new LocalDocChannel('local', b);

        a.getMap<Y.Map<unknown>>('shapes').set('r1', new Y.Map());

        expect(shapesOf(b)).toEqual(['r1']);

        ca.destroy();
        cb.destroy();
    });

    it('does not echo an applied update back to the sender', () => {
        const a = new Y.Doc();
        const b = new Y.Doc();
        new LocalDocChannel('local', a);
        new LocalDocChannel('local', b);

        // If echoes looped, applying B's relayed update on A would re-broadcast and
        // recurse; a single set that settles proves the origin guard holds.
        a.getMap<Y.Map<unknown>>('shapes').set('r1', new Y.Map());

        expect(shapesOf(a)).toEqual(['r1']);
        expect(shapesOf(b)).toEqual(['r1']);
    });

    it('answers a new tab\'s query with full current state', () => {
        const a = new Y.Doc();
        a.getMap<Y.Map<unknown>>('shapes').set('r1', new Y.Map());
        new LocalDocChannel('local', a); // existing tab already holds state

        const b = new Y.Doc();
        new LocalDocChannel('local', b); // opening tab posts a query on construct

        expect(shapesOf(b)).toEqual(['r1']);
    });

    it('isolates boards with different names', () => {
        const a = new Y.Doc();
        const b = new Y.Doc();
        new LocalDocChannel('local', a);
        new LocalDocChannel('other', b);

        a.getMap<Y.Map<unknown>>('shapes').set('r1', new Y.Map());

        expect(shapesOf(b)).toEqual([]);
    });
});
