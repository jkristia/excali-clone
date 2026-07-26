import { Injectable, signal, type Signal } from '@angular/core';
import type { Color } from '../../model/shapeTypes';
import type { ColorRole } from '../../state/recentColors';

export interface ColorFlyoutRequest {
    readonly role: ColorRole;
    /** The trigger button — its live rect positions the flyout, and its own
     *  pointerdowns are excluded from the click-outside dismissal (otherwise the
     *  trigger would close-then-immediately-reopen). */
    readonly anchor: HTMLElement;
    /** Currently applied color, so the matching swatch renders as active. */
    readonly current: Color;
    readonly resolve: (color: Color | null) => void;
}

/**
 * Drives the single app-level {@link ColorFlyoutComponent}. `open()` resolves with
 * the picked color, or `null` if dismissed without a pick. One flyout at a time —
 * opening another supersedes it. Mirrors {@link ConfirmDialogService}'s shape.
 */
@Injectable({ providedIn: 'root' })
export class ColorFlyoutService {
    private readonly pending = signal<ColorFlyoutRequest | null>(null);
    public readonly request: Signal<ColorFlyoutRequest | null> = this.pending.asReadonly();

    public open(role: ColorRole, anchor: HTMLElement, current: Color): Promise<Color | null> {
        this.pending()?.resolve(null); // supersede any flyout already open
        return new Promise<Color | null>((resolve) => this.pending.set({ role, anchor, current, resolve }));
    }

    public isOpenFor(role: ColorRole): boolean {
        return this.pending()?.role === role;
    }

    public pick(color: Color): void {
        const current = this.pending();
        if (!current) return;
        this.pending.set(null);
        current.resolve(color);
    }

    public dismiss(): void {
        const current = this.pending();
        if (!current) return;
        this.pending.set(null);
        current.resolve(null);
    }
}
