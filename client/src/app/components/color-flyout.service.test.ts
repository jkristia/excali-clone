import { describe, expect, it } from 'vitest';
import { ColorFlyoutService } from './color-flyout.service';
import type { Color } from '../../model/shapeTypes';

function anchor(): HTMLElement {
    return { contains: () => false } as unknown as HTMLElement;
}

describe('ColorFlyoutService', () => {
    it('open() populates request() with the given role, anchor, and current color', () => {
        const service = new ColorFlyoutService();
        const a = anchor();
        service.open('stroke', a, '#1e1e1e', () => {});

        const req = service.request();
        expect(req?.role).toBe('stroke');
        expect(req?.anchor).toBe(a);
        expect(req?.current).toBe('#1e1e1e');
    });

    it('pick() invokes onPick with the color but keeps the flyout open', () => {
        const service = new ColorFlyoutService();
        const picked: Color[] = [];
        service.open('fill', anchor(), 'transparent', (c) => picked.push(c));

        service.pick('#e03131');

        expect(picked).toEqual(['#e03131']);
        expect(service.request()).not.toBeNull();
    });

    it('pick() updates request().current so the active swatch tracks the latest pick', () => {
        const service = new ColorFlyoutService();
        service.open('stroke', anchor(), '#1e1e1e', () => {});

        service.pick('#e03131');
        expect(service.request()?.current).toBe('#e03131');

        service.pick('#2f9e44');
        expect(service.request()?.current).toBe('#2f9e44');
    });

    it('pick() can be called multiple times, invoking onPick each time', () => {
        const service = new ColorFlyoutService();
        const picked: Color[] = [];
        service.open('stroke', anchor(), '#1e1e1e', (c) => picked.push(c));

        service.pick('#e03131');
        service.pick('#2f9e44');
        service.pick('#1971c2');

        expect(picked).toEqual(['#e03131', '#2f9e44', '#1971c2']);
    });

    it('dismiss() clears the request without invoking onPick', () => {
        const service = new ColorFlyoutService();
        const picked: Color[] = [];
        service.open('stroke', anchor(), '#1e1e1e', (c) => picked.push(c));

        service.dismiss();

        expect(service.request()).toBeNull();
        expect(picked).toEqual([]);
    });

    it('a second open() replaces the first without invoking its onPick', () => {
        const service = new ColorFlyoutService();
        const firstPicked: Color[] = [];
        service.open('stroke', anchor(), '#1e1e1e', (c) => firstPicked.push(c));

        service.open('fill', anchor(), 'transparent', () => {});

        expect(service.request()?.role).toBe('fill');
        expect(firstPicked).toEqual([]);
    });

    it('isOpenFor matches only the currently open role', () => {
        const service = new ColorFlyoutService();
        expect(service.isOpenFor('stroke')).toBe(false);

        service.open('stroke', anchor(), '#1e1e1e', () => {});
        expect(service.isOpenFor('stroke')).toBe(true);
        expect(service.isOpenFor('fill')).toBe(false);
    });

    it('pick()/dismiss() are no-ops when nothing is pending', () => {
        const service = new ColorFlyoutService();
        expect(() => service.pick('#000000')).not.toThrow();
        expect(() => service.dismiss()).not.toThrow();
    });
});
