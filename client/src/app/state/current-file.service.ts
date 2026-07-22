import { Injectable, signal, type Signal } from '@angular/core';

/**
 * The file the current board is bound to — set after a Save-As or an Open. Holds the
 * `FileSystemFileHandle` so `Ctrl+S` can overwrite it, and exposes its `name` as a
 * signal so the shell can show which file is active. Shell/browser state (a file handle
 * isn't a domain concept), so it lives in an Angular service rather than the
 * framework-agnostic store.
 */
@Injectable({ providedIn: 'root' })
export class CurrentFileService {
    private handleRef: FileSystemFileHandle | null = null;
    private readonly nameSig = signal<string | null>(null);

    /** Filename of the bound file, or null when the board isn't bound to one yet. */
    public readonly name: Signal<string | null> = this.nameSig.asReadonly();

    public get handle(): FileSystemFileHandle | null {
        return this.handleRef;
    }

    public set(handle: FileSystemFileHandle): void {
        this.handleRef = handle;
        this.nameSig.set(handle.name);
    }

    /** Unbind the board from its file, so a later save can't silently overwrite it
     *  (used when clearing to a blank whiteboard). */
    public clear(): void {
        this.handleRef = null;
        this.nameSig.set(null);
    }
}
