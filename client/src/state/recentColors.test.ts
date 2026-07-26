import { beforeEach, describe, expect, it } from 'vitest';
import { RecentColorsStore } from './recentColors';
import { MemoryStorage } from '../test-support/memoryStorage';
import { DEFAULT_RECENT_STROKE, DEFAULT_RECENT_FILL } from '../util/palette';

const STORAGE_KEY = 'whiteboard.recentColors.v1';

globalThis.localStorage = new MemoryStorage();

beforeEach(() => {
    localStorage.clear();
});

describe('RecentColorsStore', () => {
    it('seeds a fresh browser with the pinned pair then the default recents', () => {
        const slots = new RecentColorsStore().getSlots();
        expect(slots.stroke).toEqual(['transparent', '#1e1e1e', ...DEFAULT_RECENT_STROKE]);
        expect(slots.fill).toEqual(['transparent', '#1e1e1e', ...DEFAULT_RECENT_FILL]);
    });

    it('promotes a new color to slot 2, dropping the oldest recent', () => {
        const store = new RecentColorsStore();
        store.promote('stroke', '#ff0000');
        const slots = store.getSlots();
        expect(slots.stroke[2]).toBe('#ff0000');
        expect(slots.stroke).toHaveLength(8);
        expect(slots.stroke).not.toContain(DEFAULT_RECENT_STROKE[DEFAULT_RECENT_STROKE.length - 1]);
    });

    it('moves an existing recent to the front instead of duplicating it', () => {
        const store = new RecentColorsStore();
        const before = store.getSlots().stroke;
        const target = before[4];
        store.promote('stroke', target);
        const after = store.getSlots().stroke;
        expect(after[2]).toBe(target);
        expect(after).toHaveLength(8);
        expect(new Set(after).size).toBe(after.length);
    });

    it('is a no-op for pinned colors, in any case', () => {
        const store = new RecentColorsStore();
        const before = store.getSlots();
        store.promote('stroke', 'TRANSPARENT');
        store.promote('fill', '#1E1E1E');
        expect(store.getSlots()).toEqual(before);
    });

    it('keeps stroke and fill recents independent', () => {
        const store = new RecentColorsStore();
        const fillBefore = store.getSlots().fill;
        store.promote('stroke', '#ff0000');
        expect(store.getSlots().fill).toEqual(fillBefore);
    });

    it('notifies subscribers on promote and stops after unsubscribe', () => {
        const store = new RecentColorsStore();
        const received: string[] = [];
        const unsubscribe = store.subscribe((slots) => received.push(slots.stroke[2]));
        store.promote('stroke', '#ff0000');
        unsubscribe();
        store.promote('stroke', '#00ff00');
        expect(received).toEqual(['#ff0000']);
    });

    it('round-trips through localStorage: a second instance sees the same slots, and only the 6 recents are persisted', () => {
        const store = new RecentColorsStore();
        store.promote('stroke', '#ff0000');
        const again = new RecentColorsStore();
        expect(again.getSlots()).toEqual(store.getSlots());

        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as { stroke: string[]; fill: string[] };
        expect(raw.stroke).toHaveLength(6);
        expect(raw.stroke).not.toContain('transparent');
        expect(raw.stroke).not.toContain('#1e1e1e');
    });

    it('falls back to defaults without throwing on corrupt stored values', () => {
        for (const bad of ['not json', '[]', '{"stroke":5}', '{"stroke":[1,null,{}]}']) {
            localStorage.setItem(STORAGE_KEY, bad);
            expect(() => new RecentColorsStore().getSlots()).not.toThrow();
        }
    });

    it('pads a short stored list with defaults, without duplicating', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ stroke: ['#ff0000', '#ff0000'], fill: [] }));
        const slots = new RecentColorsStore().getSlots();
        expect(slots.stroke.slice(2)).toHaveLength(6);
        expect(new Set(slots.stroke).size).toBe(slots.stroke.length);
        expect(slots.stroke[2]).toBe('#ff0000');
    });

    it('truncates a long stored list to 6 and dedupes', () => {
        const long = ['#111111', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'];
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ stroke: long, fill: [] }));
        const slots = new RecentColorsStore().getSlots();
        expect(slots.stroke.slice(2)).toHaveLength(6);
        expect(slots.stroke.slice(2)).toEqual(['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']);
    });

    it('filters stored pinned colors out of the recents', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ stroke: ['transparent', '#1E1E1E', '#ff0000'], fill: [] }));
        const slots = new RecentColorsStore().getSlots();
        expect(slots.stroke.slice(2, 3)).toEqual(['#ff0000']);
        expect(slots.stroke.filter((c) => c === 'transparent')).toHaveLength(1);
        expect(slots.stroke.filter((c) => c === '#1e1e1e')).toHaveLength(1);
    });

    it('treats mixed-case hex as the same color on both read and promote', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ stroke: ['#FF0000'], fill: [] }));
        const store = new RecentColorsStore();
        store.promote('stroke', '#ff0000');
        const slots = store.getSlots();
        expect(slots.stroke.filter((c) => c === '#ff0000')).toHaveLength(1);
    });

    it('returns a new slots identity after promote, and a stable one otherwise', () => {
        const store = new RecentColorsStore();
        const first = store.getSlots();
        expect(store.getSlots()).toBe(first);
        store.promote('stroke', '#ff0000');
        expect(store.getSlots()).not.toBe(first);
    });
});
