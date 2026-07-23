import { Injectable, computed, inject, signal, type Signal } from '@angular/core';
import { CANVAS_DOCUMENT } from '../di-tokens';

/**
 * The file the current board is bound to — set after a Save-As or an Open. The
 * `FileSystemFileHandle` stays per-tab (only the tab that opened the file can overwrite it,
 * and handles aren't shareable), but the file *name* lives in the shared doc so it syncs to
 * other tabs/peers and persists with the board. Shell/browser state (a file handle isn't a
 * domain concept), so it lives in an Angular service rather than the framework-agnostic store.
 */
@Injectable({ providedIn: 'root' })
export class CurrentFileService {
    private readonly canvasDocument = inject(CANVAS_DOCUMENT);
    private readonly handleSig = signal<FileSystemFileHandle | null>(null);
    private readonly nameSig = signal<string | null>(this.canvasDocument.fileName);

    /** Filename of the bound file, or null when the board isn't bound to one yet. Sourced from
     *  the shared doc, so it reflects a file opened in another tab too. */
    public readonly name: Signal<string | null> = this.nameSig.asReadonly();

    /** Whether *this* tab holds a handle it can overwrite (only the tab that opened/saved does). */
    public readonly hasHandle = computed(() => this.handleSig() !== null);

    public constructor() {
        this.canvasDocument.meta.observe(() => this.nameSig.set(this.canvasDocument.fileName));
    }

    public get handle(): FileSystemFileHandle | null {
        return this.handleSig();
    }

    public set(handle: FileSystemFileHandle): void {
        this.handleSig.set(handle);
        this.canvasDocument.setFileName(handle.name);
    }

    /** Unbind the board from its file, so a later save can't silently overwrite it
     *  (used when clearing to a blank whiteboard). */
    public clear(): void {
        this.handleSig.set(null);
        this.canvasDocument.setFileName(null);
    }
}
