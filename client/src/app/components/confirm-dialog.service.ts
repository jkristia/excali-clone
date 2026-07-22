import { Injectable, signal, type Signal } from '@angular/core';

export interface ConfirmOptions {
    readonly title: string;
    readonly message: string;
    /** Confirm button label. Defaults to "OK". */
    readonly confirmLabel?: string;
    /** Cancel button label. Defaults to "Cancel". */
    readonly cancelLabel?: string;
    /** Style the confirm button as destructive (red). */
    readonly danger?: boolean;
}

/** A one-button acknowledgement (no Cancel) — the styled replacement for `window.alert`. */
export interface AlertOptions {
    readonly title: string;
    readonly message: string;
    /** Dismiss button label. Defaults to "OK". */
    readonly confirmLabel?: string;
}

interface PendingConfirm extends ConfirmOptions {
    /** true ⇒ acknowledgement only: no Cancel button (see {@link ConfirmDialogService.alert}). */
    readonly alertOnly: boolean;
    readonly resolve: (confirmed: boolean) => void;
}

/**
 * Drives the single app-level {@link ConfirmDialogComponent}. Callers `await ask(...)`
 * (two-button confirm ⇒ `true`/`false`) or `await alert(...)` (one-button notice); the
 * component reads {@link request} to render the overlay and calls {@link confirm}/{@link
 * cancel} to settle the promise. One dialog at a time — opening another supersedes it.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
    private readonly pending = signal<PendingConfirm | null>(null);
    public readonly request: Signal<PendingConfirm | null> = this.pending.asReadonly();

    public ask(options: ConfirmOptions): Promise<boolean> {
        this.pending()?.resolve(false); // supersede any dialog already open
        return new Promise<boolean>((resolve) => this.pending.set({ ...options, alertOnly: false, resolve }));
    }

    public alert(options: AlertOptions): Promise<void> {
        this.pending()?.resolve(false); // supersede any dialog already open
        return new Promise<void>((resolve) =>
            this.pending.set({ ...options, danger: false, alertOnly: true, resolve: () => resolve() }),
        );
    }

    public confirm(): void {
        this.settle(true);
    }

    public cancel(): void {
        this.settle(false);
    }

    private settle(confirmed: boolean): void {
        const current = this.pending();
        if (!current) return;
        this.pending.set(null);
        current.resolve(confirmed);
    }
}
