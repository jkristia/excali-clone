import type { Color } from '../model/shapeTypes';
import { PINNED_COLORS, RECENT_SLOT_COUNT, CUSTOM_SLOT_COUNT, DEFAULT_RECENT_STROKE, DEFAULT_RECENT_FILL } from '../util/palette';

export type ColorRole = 'stroke' | 'fill';

/** `stroke`/`fill` are always PINNED_COLORS.length + RECENT_SLOT_COUNT (= 9) long,
 *  pinned first, most-recent-first among the rest, and duplicate-free.
 *  `custom` is role-agnostic on purpose — one shared list behind every palette flyout,
 *  0…CUSTOM_SLOT_COUNT long, most-recent-first, and empty on a fresh browser. */
export interface RecentColorSlots {
    readonly stroke: readonly Color[];
    readonly fill: readonly Color[];
    readonly custom: readonly Color[];
}

interface StoredRecents {
    readonly stroke: readonly unknown[];
    readonly fill: readonly unknown[];
    readonly custom: readonly unknown[];
}

/** Per-browser color memory — the per-role Stroke/Fill quick-row MRUs plus the palette
 *  flyout's shared custom-color row. Persisted to localStorage, never into the saved
 *  board file. Framework-agnostic, alongside `UIStore`; wired through Angular via a
 *  DI token + signal-bridge service. */
export class RecentColorsStore {
    private static readonly STORAGE_KEY = 'whiteboard.recentColors.v1';

    private recent: { stroke: Color[]; fill: Color[] };
    private custom: Color[];
    private slots: RecentColorSlots;
    private readonly listeners = new Set<(slots: RecentColorSlots) => void>();

    constructor() {
        const stored = this.load();
        this.recent = {
            stroke: this.sanitize(stored?.stroke, DEFAULT_RECENT_STROKE),
            fill: this.sanitize(stored?.fill, DEFAULT_RECENT_FILL),
        };
        this.custom = this.dedupe(stored?.custom, CUSTOM_SLOT_COUNT, new Set());
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
        this.commit();
    }

    /** MRU insert into the flyout's shared custom row. Role-agnostic — a color mixed
     *  while editing a stroke is offered again when editing a fill. Pinned colors are
     *  *not* excluded here: the custom row has no pinned slots of its own. */
    public promoteCustom(color: Color): void {
        const normalized = this.normalize(color);
        const others = this.custom.filter((c) => c !== normalized);
        this.custom = [normalized, ...others].slice(0, CUSTOM_SLOT_COUNT);
        this.commit();
    }

    public subscribe(listener: (slots: RecentColorSlots) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private commit(): void {
        this.slots = this.buildSlots();
        this.save();
        this.listeners.forEach((listener) => listener(this.slots));
    }

    private buildSlots(): RecentColorSlots {
        return {
            stroke: [...PINNED_COLORS, ...this.recent.stroke],
            fill: [...PINNED_COLORS, ...this.recent.fill],
            custom: [...this.custom],
        };
    }

    private normalize(color: Color): Color {
        return color.trim().toLowerCase();
    }

    /** Collapses every edge case (short/long lists, dupes, stored pinned values, mixed
     *  case, corrupt entries) into a clean list of exactly RECENT_SLOT_COUNT colors. */
    private sanitize(stored: readonly unknown[] | undefined, defaults: readonly Color[]): Color[] {
        const pinned = new Set(PINNED_COLORS.map((c) => this.normalize(c)));
        const cleaned = this.dedupe(stored, RECENT_SLOT_COUNT, pinned);
        const seen = new Set([...pinned, ...cleaned]);
        for (const fallback of defaults) {
            if (cleaned.length >= RECENT_SLOT_COUNT) break;
            const normalized = this.normalize(fallback);
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            cleaned.push(normalized);
        }
        return cleaned.slice(0, RECENT_SLOT_COUNT);
    }

    /** Normalizes an untrusted stored list into at most `limit` distinct colors,
     *  dropping non-strings and anything in `exclude`. */
    private dedupe(values: readonly unknown[] | undefined, limit: number, exclude: ReadonlySet<string>): Color[] {
        const seen = new Set<string>();
        const cleaned: Color[] = [];
        for (const value of values ?? []) {
            if (cleaned.length >= limit) break;
            if (typeof value !== 'string') continue;
            const normalized = this.normalize(value);
            if (exclude.has(normalized) || seen.has(normalized)) continue;
            seen.add(normalized);
            cleaned.push(normalized);
        }
        return cleaned;
    }

    private load(): StoredRecents | null {
        try {
            const raw = localStorage.getItem(RecentColorsStore.STORAGE_KEY);
            if (!raw) return null;
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null) return null;
            const { stroke, fill, custom } = parsed as { stroke?: unknown; fill?: unknown; custom?: unknown };
            return {
                stroke: Array.isArray(stroke) ? stroke : [],
                fill: Array.isArray(fill) ? fill : [],
                custom: Array.isArray(custom) ? custom : [],
            };
        } catch {
            /* ignore corrupt/blocked storage */
            return null;
        }
    }

    private save(): void {
        try {
            localStorage.setItem(RecentColorsStore.STORAGE_KEY, JSON.stringify({ ...this.recent, custom: this.custom }));
        } catch {
            /* ignore */
        }
    }
}
