import { beforeEach, describe, expect, it } from 'vitest';
import { IdentityStore } from './identity';
import { MemoryStorage } from '../test-support/memoryStorage';

const STORAGE_KEY = 'whiteboard.identity.v1';

globalThis.localStorage = new MemoryStorage();

beforeEach(() => {
    localStorage.clear();
});

describe('IdentityStore', () => {
    it('returns the persisted identity when valid JSON is present', () => {
        const stored = { name: 'Bold Fox', color: '#ef4444' };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        expect(new IdentityStore().load()).toEqual(stored);
    });

    it('generates and persists a random identity when none is stored', () => {
        const identity = new IdentityStore().load();
        expect(identity.name).toBeTruthy();
        expect(identity.color).toBeTruthy();
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(identity);
    });

    it('generates a random identity when stored value is corrupt', () => {
        localStorage.setItem(STORAGE_KEY, 'not json');
        const identity = new IdentityStore().load();
        expect(identity.name).toBeTruthy();
        expect(identity.color).toBeTruthy();
    });

    it('save persists the given identity', () => {
        const identity = { name: 'Calm Otter', color: '#22c55e' };
        new IdentityStore().save(identity);
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(identity);
    });
});
