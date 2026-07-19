import { Injectable, computed, inject, signal, type Signal } from '@angular/core';
import type { UIState } from '../../state/uiStore';
import { UI_STORE } from '../di-tokens';

/**
 * Angular adapter over the vanilla `UIStore` — the "one seam" where the Angular
 * shell subscribes to it; everywhere else (tools/, interaction/) reads/writes
 * the store directly. Angular's port of what was `app/state/useUIStore.ts` under
 * the earlier React shell.
 */
@Injectable({ providedIn: 'root' })
export class UiStoreService {
    private readonly uiStore = inject(UI_STORE);
    private readonly state = signal<UIState>(this.uiStore.getState());

    constructor() {
        this.uiStore.subscribe((s) => this.state.set(s));
    }

    public select<U>(selector: (s: UIState) => U): Signal<U> {
        return computed(() => selector(this.state()));
    }

    public get snapshot(): UIState {
        return this.state();
    }
}
