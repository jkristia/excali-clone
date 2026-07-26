import type { Shape } from '../model/shapeTypes';
import type { Camera, Style } from '../state/uiStore';
import type { Interaction, PointerInfo } from '../interaction/interaction';
import type { ShapeCapabilities } from '../shapes/shapeDefinition';

/** Everything a Tool needs to decide what interaction a pointer-down starts,
 * without depending on React or the store directly (keeps tools testable/portable). */
export interface ToolContext {
    shapes: () => Shape[];
    selection: () => string[];
    camera: () => Camera;
    style: () => Style;
    author: () => string;
    newId: () => string;
    nextZ: () => number;
    /** The group currently entered for scoped editing, or null. Container-aware
     *  selection stops at this group's members instead of selecting the group. */
    editingGroupId: () => string | null;
    /** Add a fully-formed shape immediately (text/note — no drag-to-create). */
    addShape: (shape: Shape) => void;
    setSelection: (ids: string[]) => void;
    toggleSelection: (id: string, additive: boolean) => void;
    activateEditing: (id: string) => void;
}

/** One class per tool: decides what interaction a pointer-down on the canvas starts. */
export interface Tool {
    /** Which properties-panel sections apply while this tool is armed and nothing is
   * selected yet — i.e. what the *next* shape it creates will support. */
    readonly panelCapabilities: ShapeCapabilities;
    /** Style overrides to apply the moment this tool is selected (e.g. Line/Arrow's
   * signature end caps). Identity tools that don't create shapes omit this. */
    defaultStyle?(style: Style): Partial<Style>;
    /** Return the interaction to enter, or null if this tool does nothing on this pointer-down
   * (e.g. text/note create the shape immediately and never enter a drag interaction). */
    onPointerDown(ctx: ToolContext, p: PointerInfo): Interaction | null;
}

export const NO_PANEL_CAPABILITIES: ShapeCapabilities = {
    stroke: false, fill: false, width: false, ends: false, note: false, text: false,
};
