import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { BurgerIconComponent } from './burger-icon.component';
import { CANVAS_DOCUMENT, DOCUMENT_FILE } from '../di-tokens';
import { UiStoreService } from '../state/ui-store.service';
import { CurrentFileService } from '../state/current-file.service';
import { ConfirmDialogService } from './confirm-dialog.service';

interface MenuItem {
    readonly label: string;
    readonly shortcut: string;
    readonly icon: 'open' | 'save' | 'download' | 'clear';
    readonly action: () => void;
}

/** Blank-board camera: 100% zoom, no pan — the same identity the store starts at,
 *  so a shape placed at centre lands in the same spot after a reload. */
const IDENTITY_CAMERA = { x: 0, y: 0, zoom: 1 } as const;

const FILE_TYPES: FilePickerAcceptType[] = [{ description: 'JSON', accept: { 'application/json': ['.json'] } }];

/**
 * Burger menu with Open / Save. The pure file format lives in the framework-agnostic
 * `DocumentFile` codec; this component only owns the browser bits — the native file
 * dialogs (File System Access API) and open/close view state.
 *
 * A save remembers its `FileSystemFileHandle`, so `Ctrl+S` overwrites the same file;
 * with no handle yet it falls back to the Save-As dialog. Opening a file adopts its
 * handle as the current file too. Browsers without the File System Access API (Firefox,
 * Safari) fall back to a plain download / hidden `<input type="file">`.
 *
 * Loading replaces the whole board via one Yjs transaction, so it propagates to every
 * peer and undoes in a single step; the restored camera/grid is local to this client.
 */
@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [BurgerIconComponent],
    templateUrl: './menu.component.html',
    styleUrl: './menu.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuComponent implements OnInit, OnDestroy {
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly canvasDocument = inject(CANVAS_DOCUMENT);
    private readonly documentFile = inject(DOCUMENT_FILE);
    private readonly ui = inject(UiStoreService);
    private readonly currentFile = inject(CurrentFileService);
    private readonly confirmDialog = inject(ConfirmDialogService);
    private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

    protected readonly open = signal(false);
    /** "Save to current file" only appears once the board is bound to a file, matching
     *  Excalidraw — otherwise there's nothing for a quick save to overwrite. */
    protected readonly items = computed<readonly MenuItem[]>(() => {
        const items: MenuItem[] = [
            { label: 'Open', shortcut: 'Ctrl+O', icon: 'open', action: () => this.run(() => this.openFile()) },
        ];
        if (this.currentFile.name()) {
            items.push({ label: 'Save to current file', shortcut: 'Ctrl+S', icon: 'save', action: () => this.run(() => this.save()) });
        }
        items.push({ label: 'Save to…', shortcut: '', icon: 'download', action: () => this.run(() => this.saveAs()) });
        items.push({ label: 'Clear Whiteboard', shortcut: '', icon: 'clear', action: () => void this.clearWhiteboard() });
        return items;
    });

    private readonly onWindowKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    private readonly onWindowPointerDown = (e: PointerEvent) => this.handlePointerDown(e);

    public ngOnInit(): void {
        window.addEventListener('keydown', this.onWindowKeyDown);
        window.addEventListener('pointerdown', this.onWindowPointerDown);
    }

    public ngOnDestroy(): void {
        window.removeEventListener('keydown', this.onWindowKeyDown);
        window.removeEventListener('pointerdown', this.onWindowPointerDown);
    }

    protected toggle(): void {
        this.open.update((v) => !v);
    }

    /** Fallback open path for browsers without `showOpenFilePicker`. */
    protected onFileChosen(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = ''; // reset so choosing the same file again re-fires change
        if (file) this.run(async () => void this.loadFromText(await file.text()));
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            this.open.set(false);
            return;
        }
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 's') {
            e.preventDefault(); // suppress the browser's "save page"
            this.run(() => this.save());
            return;
        }
        if (mod && e.key.toLowerCase() === 'o') {
            e.preventDefault(); // suppress the browser's "open file"
            this.run(() => this.openFile());
        }
    }

    private handlePointerDown(e: PointerEvent): void {
        if (this.open() && !this.host.nativeElement.contains(e.target as Node)) {
            this.open.set(false);
        }
    }

    /** Quick save: overwrite the current file, or fall back to Save-As when none is set. */
    private async save(): Promise<void> {
        this.open.set(false);
        const handle = this.currentFile.handle;
        if (!handle) {
            await this.saveAs();
            return;
        }
        await this.writeHandle(handle, this.serializeBoard());
    }

    /** Save-As: prompt for a filename / file to overwrite, then remember it for `Ctrl+S`. */
    private async saveAs(): Promise<void> {
        this.open.set(false);
        const text = this.serializeBoard();
        if (!('showSaveFilePicker' in window)) {
            this.download(this.suggestedName(), text);
            return;
        }
        const handle = await window.showSaveFilePicker({ suggestedName: this.suggestedName(), types: FILE_TYPES });
        await this.writeHandle(handle, text);
        this.currentFile.set(handle);
    }

    private async openFile(): Promise<void> {
        this.open.set(false);
        if (!('showOpenFilePicker' in window)) {
            this.fileInput().nativeElement.click();
            return;
        }
        const [handle] = await window.showOpenFilePicker({ multiple: false, types: FILE_TYPES });
        const file = await handle.getFile();
        if (this.loadFromText(await file.text())) this.currentFile.set(handle);
    }

    /** Reset to a blank board: drop every shape, recentre the camera at 100%, and
     *  unbind the current file so the next save can't overwrite the loaded document. */
    private async clearWhiteboard(): Promise<void> {
        this.open.set(false);
        const confirmed = await this.confirmDialog.ask({
            title: 'Clear whiteboard?',
            message: 'This removes all shapes for everyone in the room.',
            confirmLabel: 'Clear',
            danger: true,
        });
        if (!confirmed) return;
        this.canvasDocument.clearBoard();
        this.ui.snapshot.setCamera({ ...IDENTITY_CAMERA });
        this.currentFile.clear();
    }

    private loadFromText(text: string): boolean {
        const parsed = this.documentFile.deserialize(text);
        if (!parsed) {
            void this.confirmDialog.alert({ title: 'Invalid file', message: 'That file is not a whiteboard document.' });
            return false;
        }
        this.canvasDocument.replaceAllShapes(parsed.shapes);
        if (parsed.view) {
            this.ui.snapshot.setCamera(parsed.view.camera);
            this.ui.snapshot.setSnapToGrid(parsed.view.snapToGrid);
        }
        return true;
    }

    private serializeBoard(): string {
        const view = { camera: this.ui.snapshot.camera, snapToGrid: this.ui.snapshot.snapToGrid };
        return this.documentFile.serialize(this.canvasDocument.readAllShapes(), view);
    }

    private async writeHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
    }

    /** Download fallback for browsers without the File System Access API. */
    private download(filename: string, text: string): void {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    private suggestedName(): string {
        return `whiteboard-${this.canvasDocument.room ?? 'local'}.json`;
    }

    /** Run a file task, ignoring a user-dismissed dialog and surfacing real failures. */
    private run(task: () => Promise<void>): void {
        void task().catch((e: unknown) => {
            if (e instanceof DOMException && e.name === 'AbortError') return; // dialog dismissed
            console.error(e);
            void this.confirmDialog.alert({ title: 'File operation failed', message: 'Sorry — that file operation failed.' });
        });
    }
}
