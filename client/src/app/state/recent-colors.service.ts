import { Injectable, computed, inject, signal, type Signal } from '@angular/core';
import type { Color } from '../../model/types';
import type { ColorRole, RecentColorSlots } from '../../state/recentColors';
import { RECENT_COLORS } from '../di-tokens';

/**
 * Angular adapter over the vanilla `RecentColorsStore` — the store's `subscribe`
 * is invisible to signals, so this is the one seam that bridges it, mirroring
 * `UiStoreService`'s role for `UIStore`.
 */
@Injectable({ providedIn: 'root' })
export class RecentColorsService {
    private readonly store = inject(RECENT_COLORS);
    private readonly slotsSignal = signal<RecentColorSlots>(this.store.getSlots());

    constructor() {
        this.store.subscribe((slots) => this.slotsSignal.set(slots));
    }

    public slots(role: ColorRole): Signal<readonly Color[]> {
        return computed(() => this.slotsSignal()[role]);
    }

    public promote(role: ColorRole, color: Color): void {
        this.store.promote(role, color);
    }
}
