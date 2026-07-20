import type { CornerStyle, EndpointCap, TextAlign } from '../model/types';
import { ToolRegistry } from '../tools/toolRegistry';
import { STROKE_COLORS, FILL_COLORS, NOTE_COLORS } from '../util/palette';

export type Tool = 'select' | 'pan' | 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'draw' | 'text' | 'note';

export interface Camera {
    x: number; // world coordinate at screen origin
    y: number;
    zoom: number;
}

export interface Style {
    stroke: string;
    fill: string;
    strokeWidth: number;
    fontSize: number;
    textAlign: TextAlign;
    noteFill: string;
    startCap: EndpointCap;
    endCap: EndpointCap;
    edges: CornerStyle;
}

export interface UIState {
    readonly tool: Tool;
    /** true while Space is held — used to show the pan tool as active in the toolbar. */
    readonly spacePan: boolean;
    readonly camera: Camera;
    readonly style: Style;
    /** ids of locally-selected shapes. */
    readonly selection: string[];
    /** id of the text/note currently being edited inline, if any. */
    readonly editingId: string | null;

    setTool: (tool: Tool) => void;
    setSpacePan: (active: boolean) => void;
    setCamera: (camera: Camera) => void;
    panBy: (dxScreen: number, dyScreen: number) => void;
    setStyle: (patch: Partial<Style>) => void;
    setSelection: (ids: string[]) => void;
    toggleSelection: (id: string, additive: boolean) => void;
    clearSelection: () => void;
    setEditing: (id: string | null) => void;
    /** Atomically switch to select tool and start editing id — no intermediate state where editingId is null. */
    activateEditing: (id: string) => void;
}

type SetState = (partial: Partial<UIState> | ((state: UIState) => Partial<UIState>), replace?: boolean) => void;

/**
 * Framework-agnostic store — no React/Angular binding.
 * Non-framework code (tools/, interaction/) can read/write it via `.getState()` directly.
 */
export class UIStore {
    private state: UIState;
    private readonly initialState: UIState;
    private readonly listeners = new Set<(state: UIState) => void>();

    constructor(toolRegistry: ToolRegistry) {
        const set: SetState = (partial, replace) => this.setState(partial, replace);

        this.state = {
            tool: 'select',
            spacePan: false,
            camera: { x: 0, y: 0, zoom: 1 },
            style: {
                stroke: STROKE_COLORS[1],
                fill: FILL_COLORS[0],
                strokeWidth: 2,
                fontSize: 20,
                textAlign: 'left',
                noteFill: NOTE_COLORS[0],
                startCap: 'none',
                endCap: 'arrow',
                edges: 'sharp',
            },
            selection: [],
            editingId: null,

            setTool: (tool) =>
                set((s) => ({
                    tool,
                    editingId: null,
                    style: { ...s.style, ...toolRegistry.get(tool).defaultStyle?.(s.style) },
                })),
            setSpacePan: (active) => set({ spacePan: active }),
            setCamera: (camera) => set({ camera }),
            panBy: (dxScreen, dyScreen) =>
                set((s) => ({
                    camera: {
                        ...s.camera,
                        x: s.camera.x - dxScreen / s.camera.zoom,
                        y: s.camera.y - dyScreen / s.camera.zoom,
                    },
                })),
            setStyle: (patch) => set((s) => ({ style: { ...s.style, ...patch } })),
            setSelection: (ids) => set({ selection: ids }),
            toggleSelection: (id, additive) =>
                set((s) => {
                    if (!additive) return { selection: [id] };
                    return s.selection.includes(id)
                        ? { selection: s.selection.filter((x) => x !== id) }
                        : { selection: [...s.selection, id] };
                }),
            clearSelection: () => set({ selection: [] }),
            setEditing: (id) => set({ editingId: id }),
            activateEditing: (id) => set({ tool: 'select', editingId: id }),
        };
        this.initialState = this.state;
    }

    public getState(): UIState {
        return this.state;
    }

    public getInitialState(): UIState {
        return this.initialState;
    }

    public setState(partial: Parameters<SetState>[0], replace?: boolean): void {
        const patch = typeof partial === 'function' ? partial(this.state) : partial;
        this.state = replace ? (patch as UIState) : { ...this.state, ...patch };
        this.listeners.forEach((listener) => listener(this.state));
    }

    public subscribe(listener: (state: UIState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}
