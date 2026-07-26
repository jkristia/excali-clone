import type { Color } from '../model/types';
import { PINNED_COLORS, RECENT_SLOT_COUNT, DEFAULT_RECENT_STROKE, DEFAULT_RECENT_FILL } from '../util/palette';

export type ColorRole = 'stroke' | 'fill';

/** Each array is always PINNED_COLORS.length + RECENT_SLOT_COUNT (= 8) long,
 *  pinned first, most-recent-first among the rest, and duplicate-free. */
export interface RecentColorSlots {
    readonly stroke: readonly Color[];
    readonly fill: readonly Color[];
}

interface StoredRecents {
    readonly stroke: readonly unknown[];
    readonly fill: readonly unknown[];
}

/** Per-browser MRU memory for the Stroke/Fill quick-color rows — persisted to
 *  localStorage, never into the saved board file. Framework-agnostic, alongside
 *  `UIStore`; wired through Angular via a DI token + signal-bridge service. */
export class RecentColorsStore {
    private static readonly STORAGE_KEY = 'whiteboard.recentColors.v1';

    private recent: { stroke: Color[]; fill: Color[] };
    private slots: RecentColorSlots;
    private readonly listeners = new Set<(slots: RecentColorSlots) => void>();

    constructor() {
        const stored = this.load();
        this.recent = {
            stroke: this.sanitize(stored?.stroke, DEFAULT_RECENT_STROKE),
            fill: this.sanitize(stored?.fill, DEFAULT_RECENT_FILL),
        };
        this.slots = this.buildSlots();
    }

    public getSlots(): RecentColorSlots {
        return this.slots;
    }

    /** MRU insert at slot 2 (right after the pinned pair). No-op for pinned colors;
     *  re-picking an existing recent moves it to the front rather than duplicating it. */
    public promote(role: ColorRole, color: Color): void {
        const normalized = this.normalize(color);
        if (PINNED_COLORS.some((c) => this.normalize(c) === normalized)) return;
        const others = this.recent[role].filter((c) => c !== normalized);
        this.recent = { ...this.recent, [role]: [normalized, ...others].slice(0, RECENT_SLOT_COUNT) };
        this.slots = this.buildSlots();
        this.save();
        this.listeners.forEach((listener) => listener(this.slots));
    }

    public subscribe(listener: (slots: RecentColorSlots) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private buildSlots(): RecentColorSlots {
        return {
            stroke: [...PINNED_COLORS, ...this.recent.stroke],
            fill: [...PINNED_COLORS, ...this.recent.fill],
        };
    }

    private normalize(color: Color): Color {
        return color.trim().toLowerCase();
    }

    /** Collapses every edge case (short/long lists, dupes, stored pinned values, mixed
     *  case, corrupt entries) into a clean list of exactly RECENT_SLOT_COUNT colors. */
    private sanitize(stored: readonly unknown[] | undefined, defaults: readonly Color[]): Color[] {
        const pinned = new Set(PINNED_COLORS.map((c) => this.normalize(c)));
        const seen = new Set<string>();
        const cleaned: Color[] = [];
        for (const value of stored ?? []) {
            if (typeof value !== 'string') continue;
            const normalized = this.normalize(value);
            if (pinned.has(normalized) || seen.has(normalized)) continue;
            seen.add(normalized);
            cleaned.push(normalized);
        }
        for (const fallback of defaults) {
            if (cleaned.length >= RECENT_SLOT_COUNT) break;
            const normalized = this.normalize(fallback);
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            cleaned.push(normalized);
        }
        return cleaned.slice(0, RECENT_SLOT_COUNT);
    }

    private load(): StoredRecents | null {
        try {
            const raw = localStorage.getItem(RecentColorsStore.STORAGE_KEY);
            if (!raw) return null;
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null) return null;
            const { stroke, fill } = parsed as { stroke?: unknown; fill?: unknown };
            return {
                stroke: Array.isArray(stroke) ? stroke : [],
                fill: Array.isArray(fill) ? fill : [],
            };
        } catch {
            /* ignore corrupt/blocked storage */
            return null;
        }
    }

    private save(): void {
        try {
            localStorage.setItem(RecentColorsStore.STORAGE_KEY, JSON.stringify(this.recent));
        } catch {
            /* ignore */
        }
    }
}
