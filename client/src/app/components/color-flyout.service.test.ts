import { describe, expect, it } from 'vitest';
import { ColorFlyoutService } from './color-flyout.service';

function anchor(): HTMLElement {
    return { contains: () => false } as unknown as HTMLElement;
}

describe('ColorFlyoutService', () => {
    it('open() populates request() with the given role, anchor, and current color', () => {
        const service = new ColorFlyoutService();
        const a = anchor();
        void service.open('stroke', a, '#1e1e1e');

        const req = service.request();
        expect(req?.role).toBe('stroke');
        expect(req?.anchor).toBe(a);
        expect(req?.current).toBe('#1e1e1e');
    });

    it('pick() resolves the pending promise with the color and clears the request', async () => {
        const service = new ColorFlyoutService();
        const promise = service.open('fill', anchor(), 'transparent');
        service.pick('#e03131');

        expect(await promise).toBe('#e03131');
        expect(service.request()).toBeNull();
    });

    it('dismiss() resolves the pending promise with null and clears the request', async () => {
        const service = new ColorFlyoutService();
        const promise = service.open('stroke', anchor(), '#1e1e1e');
        service.dismiss();

        expect(await promise).toBeNull();
        expect(service.request()).toBeNull();
    });

    it('a second open() supersedes the first, resolving it with null', async () => {
        const service = new ColorFlyoutService();
        const first = service.open('stroke', anchor(), '#1e1e1e');
        service.open('fill', anchor(), 'transparent');

        expect(await first).toBeNull();
        expect(service.request()?.role).toBe('fill');
    });

    it('isOpenFor matches only the currently open role', () => {
        const service = new ColorFlyoutService();
        expect(service.isOpenFor('stroke')).toBe(false);

        void service.open('stroke', anchor(), '#1e1e1e');
        expect(service.isOpenFor('stroke')).toBe(true);
        expect(service.isOpenFor('fill')).toBe(false);
    });

    it('pick()/dismiss() are no-ops when nothing is pending', () => {
        const service = new ColorFlyoutService();
        expect(() => service.pick('#000000')).not.toThrow();
        expect(() => service.dismiss()).not.toThrow();
    });
});
