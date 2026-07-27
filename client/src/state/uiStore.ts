import { Font, type Color, type CornerStyle, type EndpointCap, type FillStyle, type Sloppiness, type StrokeStyle, type TextAlign, type VerticalAlign } from '../model/shapeTypes';
import { ToolRegistry } from '../tools/toolRegistry';
import { NOTE_COLORS, INK, TRANSPARENT } from '../util/palette';
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
    sloppiness: Sloppiness;
    /** 0..1 shape opacity applied to the current selection. */
    opacity: number;
    /** Text options for the next shape's caption or body — see {@link TextOptionsUtil.fromStyle}. */
    fontSize: number;
    fontFamily: Font;
    hAlign: TextAlign;
    vAlign: VerticalAlign;
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
    /** id of the single arrow/line currently in point-edit mode (double-clicked; shows
     *  midpoint insert handles), or null. Transient, local-only view state (never in
     *  Yjs). Cleared by `setTool`, `clearSelection`, and by `setSelection` whenever the
     *  point-edited shape is no longer in the new selection. */
    readonly pointEditId: string | null;
    /** Anchor indices selected within the point-edited line — what a drag moves and
     *  what Delete removes. Always empty when `pointEditId` is null: the two exit
     *  together via {@link UIStore.EXIT_POINT_EDIT}. Held by index, so read sites must
     *  tolerate stale indices (see `ArrowPoints.validIndices`). */
    readonly pointEditNodes: readonly number[];

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
    /** Enter (or, with null, exit) point-edit mode for the given arrow/line. Always
     *  resets the node selection. */
    setPointEditing: (id: string | null) => void;
    /** Replace the set of selected anchor indices within the point-edited line. */
    setPointEditNodes: (indices: readonly number[]) => void;
    /** Add/remove one anchor index (`additive`), or select just it. Mirrors
     *  {@link UIState.toggleSelection} for shapes. */
    togglePointEditNode: (index: number, additive: boolean) => void;
}

type SetState = (partial: Partial<UIState> | ((state: UIState) => Partial<UIState>), replace?: boolean) => void;

/**
 * Framework-agnostic store — no React/Angular binding.
 * Non-framework code (tools/, interaction/) can read/write it via `.getState()` directly.
 */
export class UIStore {
    /** The one way to leave point-edit mode. Spread into every state change that drops
     *  `pointEditId`, so the "no node selection without a point-edited shape" invariant
     *  can't be broken by forgetting a field at a new call site. */
    private static readonly EXIT_POINT_EDIT = { pointEditId: null, pointEditNodes: [] } as const;

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
                stroke: INK,
                fill: TRANSPARENT,
                strokeWidth: 2,
                strokeStyle: 'solid',
                fillStyle: 'solid',
                sloppiness: 'plain',
                opacity: 1,
                fontSize: FontUtil.mediumSize(Font.Font1),
                fontFamily: Font.Font1,
                hAlign: 'left',
                vAlign: 'middle',
                noteFill: NOTE_COLORS[0],
                startCap: 'none',
                endCap: 'arrow',
                edges: 'sharp',
            },
            selection: [],
            editingId: null,
            editingCaret: null,
            editingGroupId: null,
            pointEditId: null,
            pointEditNodes: [],

            setTool: (tool) =>
                set((s) => ({
                    tool,
                    editingId: null,
                    editingGroupId: null,
                    ...UIStore.EXIT_POINT_EDIT,
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
            setSelection: (ids) =>
                set((s) => (s.pointEditId !== null && ids.includes(s.pointEditId)
                    ? { selection: ids }
                    : { selection: ids, ...UIStore.EXIT_POINT_EDIT })),
            toggleSelection: (id, additive) =>
                set((s) => {
                    if (!additive) return { selection: [id] };
                    return s.selection.includes(id)
                        ? { selection: s.selection.filter((x) => x !== id) }
                        : { selection: [...s.selection, id] };
                }),
            clearSelection: () => set({ selection: [], editingGroupId: null, ...UIStore.EXIT_POINT_EDIT }),
            setEditing: (id, caret = null) => set({ editingId: id, editingCaret: caret }),
            activateEditing: (id) => set({ tool: 'select', editingId: id, editingCaret: null }),
            setEditingGroup: (id) => set({ editingGroupId: id }),
            setPointEditing: (id) => set({ ...UIStore.EXIT_POINT_EDIT, pointEditId: id }),
            setPointEditNodes: (indices) => set({ pointEditNodes: indices }),
            togglePointEditNode: (index, additive) =>
                set((s) => {
                    if (!additive) return { pointEditNodes: [index] };
                    return s.pointEditNodes.includes(index)
                        ? { pointEditNodes: s.pointEditNodes.filter((i) => i !== index) }
                        : { pointEditNodes: [...s.pointEditNodes, index] };
                }),
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
