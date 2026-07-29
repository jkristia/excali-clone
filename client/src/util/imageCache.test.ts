import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageCache } from './imageCache';
import { FakeImage } from '../test-support/fakeImage';

beforeEach(() => {
    FakeImage.instances = [];
    vi.stubGlobal('Image', FakeImage);
});

describe('ImageCache.get', () => {
    it('returns null before decode completes, then the image after onload', () => {
        const cache = new ImageCache();
        expect(cache.get('data:a')).toBeNull();
        FakeImage.instances[0].onload?.();
        expect(cache.get('data:a')).toBe(FakeImage.instances[0]);
    });

    it('never starts a second decode for a src already pending or resolved', () => {
        const cache = new ImageCache();
        cache.get('data:a');
        cache.get('data:a');
        expect(FakeImage.instances).toHaveLength(1);

        FakeImage.instances[0].onload?.();
        cache.get('data:a');
        expect(FakeImage.instances).toHaveLength(1);
    });

    it('treats a failed decode as terminal — no retry on later get() calls', () => {
        const cache = new ImageCache();
        cache.get('data:bad');
        FakeImage.instances[0].onerror?.();
        expect(cache.get('data:bad')).toBeNull();
        expect(FakeImage.instances).toHaveLength(1);
    });
});

describe('ImageCache.load', () => {
    it('resolves once the image decodes', async () => {
        const cache = new ImageCache();
        const promise = cache.load('data:a');
        FakeImage.instances[0].onload?.();
        await expect(promise).resolves.toBe(FakeImage.instances[0]);
    });

    it('rejects when the image fails to decode', async () => {
        const cache = new ImageCache();
        const promise = cache.load('data:bad');
        FakeImage.instances[0].onerror?.();
        await expect(promise).rejects.toThrow();
    });

    it('shares one decode between concurrent load() calls for the same src', async () => {
        const cache = new ImageCache();
        const first = cache.load('data:a');
        const second = cache.load('data:a');
        FakeImage.instances[0].onload?.();
        await Promise.all([first, second]);
        expect(FakeImage.instances).toHaveLength(1);
    });
});

describe('ImageCache.onChange', () => {
    it('fires once per completed decode, success or failure', () => {
        const cache = new ImageCache();
        const listener = vi.fn();
        cache.onChange(listener);

        cache.get('data:a');
        FakeImage.instances[0].onload?.();
        expect(listener).toHaveBeenCalledTimes(1);

        cache.get('data:bad');
        FakeImage.instances[1].onerror?.();
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('stops firing after unsubscribe', () => {
        const cache = new ImageCache();
        const listener = vi.fn();
        const unsubscribe = cache.onChange(listener);
        unsubscribe();

        cache.get('data:a');
        FakeImage.instances[0].onload?.();
        expect(listener).not.toHaveBeenCalled();
    });
});
