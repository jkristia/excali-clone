import { Font, type Color, type CornerStyle, type EndpointCap, type FillStyle, type StrokeStyle, type TextAlign, type VerticalAlign } from '../model/types';
import { ToolRegistry } from '../tools/toolRegistry';
import { STROKE_COLORS, FILL_COLORS, NOTE_COLORS } from '../util/palette';
import { FontUtil } from '../util/fontUtil';

export type Tool = 'select' | 'pan' | 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'draw' | 'text' | 'note';

export interface Camera {
    x: number; // world coordinate at screen origin
    y: number;
    zoom: number;
}

export interface Style {
    stroke: Color;
    fill: Color;
    strokeWidth: number;
    strokeStyle: StrokeStyle;
    fillStyle: FillStyle;
    /** 0..1 shape opacity applied to the current selection. */
    opacity: number;
    fontSize: number;
    fontFamily: Font;
    /** Caption font size (px) for the label control. */
    labelFontSize: number;
    labelFontFamily: Font;
    /** Caption horizontal/vertical alignment for the label-align controls. */
    labelHAlign: TextAlign;
    labelVAlign: VerticalAlign;
    textAlign: TextAlign;
    noteFill: Color;
    startCap: EndpointCap;
    endCap: EndpointCap;
    edges: CornerStyle;
}

export interface UIState {
    readonly tool: Tool;
    /** true while Space is held — used to show the pan tool as active in the toolbar. */
    readonly spacePan: boolean;
    /** when true, the grid is shown and shapes snap to it during move/resize/create. */
    readonly snapToGrid: boolean;
    readonly camera: Camera;
    readonly style: Style;
    /** ids of locally-selected shapes. */
    readonly selection: string[];
    /** id of the text/note currently being edited inline, if any. */
    readonly editingId: string | null;
    /** Where to place the caret when the inline editor opens: a world point places the
     *  caret nearest that point (click-to-edit); null selects all (double-click / new shape). */
    readonly editingCaret: { x: number; y: number } | null;
    /** id of the group currently "entered" for scoped editing, if any. Transient,
     *  local-only view state (never in Yjs) — peers keep seeing the group as a unit.
     *  While set, clicks/marquee act on that group's members and its bounds get a
     *  dashed active-container outline. */
    readonly editingGroupId: string | null;

    setTool: (tool: Tool) => void;
    setSpacePan: (active: boolean) => void;
    setSnapToGrid: (active: boolean) => void;
    toggleSnapToGrid: () => void;
    setCamera: (camera: Camera) => void;
    panBy: (dxScreen: number, dyScreen: number) => void;
    setStyle: (patch: Partial<Style>) => void;
    setSelection: (ids: string[]) => void;
    toggleSelection: (id: string, additive: boolean) => void;
    clearSelection: () => void;
    setEditing: (id: string | null, caret?: { x: number; y: number } | null) => void;
    /** Atomically switch to select tool and start editing id — no intermediate state where editingId is null. */
    activateEditing: (id: string) => void;
    /** Enter (or, with null, exit) a group for scoped editing. */
    setEditingGroup: (id: string | null) => void;
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
            snapToGrid: false,
            camera: { x: 0, y: 0, zoom: 1 },
            style: {
                stroke: STROKE_COLORS[1],
                fill: FILL_COLORS[0],
                strokeWidth: 2,
                strokeStyle: 'solid',
                fillStyle: 'solid',
                opacity: 1,
                fontSize: FontUtil.mediumSize(Font.Font1),
                fontFamily: Font.Font1,
                labelFontSize: FontUtil.smallSize(Font.Font1),
                labelFontFamily: Font.Font1,
                labelHAlign: 'center',
                labelVAlign: 'middle',
                textAlign: 'left',
                noteFill: NOTE_COLORS[0],
                startCap: 'none',
                endCap: 'arrow',
                edges: 'sharp',
            },
            selection: [],
            editingId: null,
            editingCaret: null,
            editingGroupId: null,

            setTool: (tool) =>
                set((s) => ({
                    tool,
                    editingId: null,
                    editingGroupId: null,
                    style: { ...s.style, ...toolRegistry.get(tool).defaultStyle?.(s.style) },
                })),
            setSpacePan: (active) => set({ spacePan: active }),
            setSnapToGrid: (active) => set({ snapToGrid: active }),
            toggleSnapToGrid: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
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
            clearSelection: () => set({ selection: [], editingGroupId: null }),
            setEditing: (id, caret = null) => set({ editingId: id, editingCaret: caret }),
            activateEditing: (id) => set({ tool: 'select', editingId: id, editingCaret: null }),
            setEditingGroup: (id) => set({ editingGroupId: id }),
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
