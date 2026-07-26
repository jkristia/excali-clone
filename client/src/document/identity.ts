import type { Color, UserPresence } from '../model/shapeTypes';

/** Stable-per-browser identity, persisted in localStorage. */
export class IdentityStore {
    private static readonly STORAGE_KEY = 'whiteboard.identity.v1';

    private static readonly COLORS: Color[] = [
        '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
        '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
        '#d946ef', '#ec4899',
    ];

    private static readonly ADJECTIVES = ['Swift', 'Bright', 'Calm', 'Bold', 'Keen', 'Lively', 'Sunny', 'Cosmic', 'Mellow', 'Nimble'];
    private static readonly ANIMALS = ['Otter', 'Falcon', 'Panda', 'Lynx', 'Heron', 'Fox', 'Koala', 'Wolf', 'Robin', 'Orca'];

    private randomFrom<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    public load(): UserPresence {
        try {
            const raw = localStorage.getItem(IdentityStore.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as UserPresence;
                if (parsed.name && parsed.color) return parsed;
            }
        } catch {
            /* ignore corrupt/blocked storage */
        }
        const identity: UserPresence = {
            name: `${this.randomFrom(IdentityStore.ADJECTIVES)} ${this.randomFrom(IdentityStore.ANIMALS)}`,
            color: this.randomFrom(IdentityStore.COLORS),
        };
        this.save(identity);
        return identity;
    }

    public save(identity: UserPresence): void {
        try {
            localStorage.setItem(IdentityStore.STORAGE_KEY, JSON.stringify(identity));
        } catch {
            /* ignore */
        }
    }
}
