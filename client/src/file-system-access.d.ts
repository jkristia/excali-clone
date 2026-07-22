// Minimal ambient types for the File System Access API picker entry points, which
// TypeScript 5.9's lib.dom.d.ts does not declare yet. The handle and writable-stream
// types they return (`FileSystemFileHandle`, `FileSystemWritableFileStream`) are
// already built into lib.dom, so only the `window.*` entry points are declared here.

interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
}

interface OpenFilePickerOptions {
    multiple?: boolean;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
}

interface Window {
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
    showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
