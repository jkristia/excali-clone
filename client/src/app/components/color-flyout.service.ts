import { Injectable, signal, type Signal } from '@angular/core';
import type { Color } from '../../model/shapeTypes';
import type { ColorRole } from '../../state/recentColors';

export interface ColorFlyoutRequest {
    readonly role: ColorRole;
    /** The trigger button — its live rect positions the flyout, and its own
     *  pointerdowns are excluded from the click-outside dismissal (otherwise the
     *  trigger would close-then-immediately-reopen). */
    readonly anchor: HTMLElement;
    /** Currently applied color, so the matching swatch renders as active. Updated
     *  on every pick() so the highlight tracks the most recent pick, not just the
     *  color that was current when the flyout opened. */
    readonly current: Color;
    /** Fired once per pick (swatch click or custom color input) — not a one-shot
     *  resolver. The flyout stays open across repeated picks; only dismiss()
     *  clears the pending request. */
    readonly onPick: (color: Color) => void;
}

/**
 * Drives the single app-level {@link ColorFlyoutComponent}. `open()` registers an
 * `onPick` callback that fires on every pick while the flyout stays open — it only
 * closes via `dismiss()` (outside click / Escape / re-toggling the trigger). One
 * flyout at a time — opening another replaces it; the superseded request's onPick
 * is simply discarded, never invoked.
 */
@Injectable({ providedIn: 'root' })
export class ColorFlyoutService {
    private readonly pending = signal<ColorFlyoutRequest | null>(null);
    public readonly request: Signal<ColorFlyoutRequest | null> = this.pending.asReadonly();

    public open(role: ColorRole, anchor: HTMLElement, current: Color, onPick: (color: Color) => void): void {
        this.pending.set({ role, anchor, current, onPick });
    }

    public isOpenFor(role: ColorRole): boolean {
        return this.pending()?.role === role;
    }

    /** Applies a pick via the pending request's onPick and updates `current` in
     *  place so the active-swatch highlight tracks it. Does NOT close the flyout. */
    public pick(color: Color): void {
        const current = this.pending();
        if (!current) return;
        this.pending.set({ ...current, current: color });
        current.onPick(color);
    }

    public dismiss(): void {
        if (!this.pending()) return;
        this.pending.set(null);
    }
}
