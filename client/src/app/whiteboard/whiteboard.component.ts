import { Component, ElementRef, OnDestroy, AfterViewInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { UiStoreService } from '../state/ui-store.service';
import { CollabService } from '../collab/collab.service';
import { InlineEditorComponent } from '../components/inline-editor.component';
import type { Bounds, PeerPresence, Shape } from '../../model/shapeTypes';
import { CameraMath } from '../../canvas/camera';
import { SCENE_RENDERER, CANVAS_DOCUMENT, TOOL_REGISTRY, SHAPE_REGISTRY, CLIPBOARD_CONTROLLER, TEXT_MEASURE } from '../di-tokens';
import { InteractionController } from '../../interaction/interactionController';
import type { PointerInfo } from '../../interaction/interaction';
import { SceneTree } from '../../util/sceneTree';
import { Geometry } from '../../util/geometry';
import { Handles } from '../../util/handles';
import { ArrowPoints } from '../../util/arrowPoints';
import { FontUtil } from '../../util/fontUtil';

/** World-space offset applied to each duplicate, down-right from its source. */
const DUPLICATE_OFFSET = 20;
/** Arrow-key nudge step, in world px; Shift+arrow uses the larger step. */
const NUDGE_STEP = 1;
const NUDGE_STEP_SHIFT = 10;

@Component({
    selector: 'app-whiteboard',
    standalone: true,
    imports: [InlineEditorComponent],
    templateUrl: './whiteboard.component.html',
    styleUrl: './whiteboard.component.scss',
})
export class WhiteboardComponent implements AfterViewInit, OnDestroy {
    private readonly ui = inject(UiStoreService);
    private readonly collab = inject(CollabService);
    private readonly canvasDocument = inject(CANVAS_DOCUMENT);
    private readonly sceneRenderer = inject(SCENE_RENDERER);
    private readonly toolRegistry = inject(TOOL_REGISTRY);
    private readonly shapeRegistry = inject(SHAPE_REGISTRY);
    private readonly textMeasure = inject(TEXT_MEASURE);

    private readonly author = () => String(this.canvasDocument.awareness.clientID);

    private readonly clipboard = inject(CLIPBOARD_CONTROLLER);

    private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
    private readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('container');

    protected readonly shapes = this.collab.shapes;
    protected readonly peers = this.collab.peers;
    private readonly selection = this.ui.select((s) => s.selection);
    private readonly tool = this.ui.select((s) => s.tool);
    private readonly spacePan = this.ui.select((s) => s.spacePan);
    private readonly snapToGrid = this.ui.select((s) => s.snapToGrid);
    private readonly camera = this.ui.select((s) => s.camera);
    private readonly editingId = this.ui.select((s) => s.editingId);
    private readonly editingGroupId = this.ui.select((s) => s.editingGroupId);
    private readonly pointEditId = this.ui.select((s) => s.pointEditId);
    private readonly pointEditNodes = this.ui.select((s) => s.pointEditNodes);

    private shapesLatest: Shape[] = [];
    private peersLatest: PeerPresence[] = [];
    private readonly handleCursor = signal<string | null>(null);

    protected readonly cursor = computed(() => {
        const tool = this.tool();
        if (tool === 'pan' || this.spacePan()) return 'grab';
        if (tool === 'select') return this.handleCursor() ?? 'default';
        if (tool === 'text') return 'text';
        return 'crosshair';
    });

    private readonly controller = new InteractionController({
        shapes: () => this.shapesLatest,
        getStore: () => this.ui.snapshot,
        doc: {
            addShape: this.canvasDocument.addShape.bind(this.canvasDocument),
            updateShapes: this.canvasDocument.updateShapes.bind(this.canvasDocument),
        },
        author: this.author,
        topZ: this.canvasDocument.topZ.bind(this.canvasDocument),
        measureTextWrap: (text, fontSize, width, fontFamily) => this.textMeasure.measureTextWrapped(text, fontSize, width, fontFamily).h,
    }, this.toolRegistry, this.shapeRegistry);

    private spaceDown = false;
    /** Last pointer position over the canvas, in screen (CSS) pixels — the paste anchor.
     *  Stored as screen coords (not world) so paste follows the pointer even after a
     *  wheel zoom/pan that moved the world point under a stationary cursor. */
    private lastPointerScreen: { x: number; y: number } | null = null;
    private size = { width: 0, height: 0, dpr: 1 };
    private rafScheduled = false;
    private ro: ResizeObserver | null = null;
    private readonly cleanups: Array<() => void> = [];

    constructor() {
        // --- Publish selection through awareness whenever it changes ---
        effect(() => {
            this.canvasDocument.awareness.setLocalStateField('selection', this.selection());
        });

        // --- On-demand rendering: redraw whenever shapes, presence, or any local
        // UI state (camera/selection/editingId/tool) changes. rAF coalesces bursts. ---
        effect(() => {
            this.shapesLatest = this.shapes();
            this.peersLatest = this.peers();
            // Read every signal the renderer depends on so this effect re-runs on each.
            void this.camera();
            void this.selection();
            void this.editingId();
            void this.editingGroupId();
            void this.pointEditId();
            void this.pointEditNodes();
            void this.tool();
            void this.spacePan();
            void this.snapToGrid();
            this.scheduleRender();
        });
    }

    public ngAfterViewInit(): void {
        const canvas = this.canvasRef().nativeElement;
        const container = this.containerRef().nativeElement;

        this.canvasDocument.awareness.setLocalStateField('user', this.canvasDocument.identity);

        // --- Canvas sizing (device-pixel-ratio aware) ---
        const resize = () => {
            const dpr = window.devicePixelRatio || 1;
            const { clientWidth, clientHeight } = container;
            canvas.width = Math.round(clientWidth * dpr);
            canvas.height = Math.round(clientHeight * dpr);
            canvas.style.width = `${clientWidth}px`;
            canvas.style.height = `${clientHeight}px`;
            this.size = { width: clientWidth, height: clientHeight, dpr };
            this.scheduleRender();
        };
        resize();
        this.ro = new ResizeObserver(resize);
        this.ro.observe(container);

        // --- Force the custom @font-face files to load, then redraw so the first paint
        // isn't stuck on the fallback font (canvas never repaints itself on font load). ---
        void FontUtil.loadAll()
            .then(() => this.scheduleRender())
            .catch((e: unknown) => console.error(e));

        // --- Keyboard shortcuts (delete / escape) ---
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                this.spaceDown = true;
                this.ui.snapshot.setSpacePan(true);
            }
            const editing = this.ui.snapshot.editingId;
            const target = e.target as HTMLElement;
            const typing = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || editing;
            if (typing) return;

            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                void this.clipboard.copy();
                return;
            }
            if (mod && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                this.pasteAtPointer();
                return;
            }
            if (mod && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                this.clipboard.duplicate(DUPLICATE_OFFSET, DUPLICATE_OFFSET);
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                // In point-edit mode with nodes picked, Delete removes those nodes rather
                // than the shape — deleting the line itself means leaving point-edit first.
                if (this.deleteSelectedNodes()) return;
                const sel = this.ui.snapshot.selection;
                if (sel.length) {
                    this.canvasDocument.deleteShapes(sel);
                    this.ui.snapshot.clearSelection();
                }
            } else if (e.key.startsWith('Arrow')) {
                const sel = this.ui.snapshot.selection;
                if (sel.length) {
                    e.preventDefault();
                    const step = e.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
                    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                    const moved = sel.flatMap((id) => SceneTree.boundableDescendants(this.shapesLatest, id));
                    const patches = moved.map((s) => ({ id: s.id, patch: { x: s.x + dx, y: s.y + dy } }));
                    if (patches.length) this.canvasDocument.updateShapes(patches);
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.controller.getInteraction().kind === 'arrow-multi') {
                    this.controller.finishMultiPoint();
                    return;
                }
                const sel = this.ui.snapshot.selection;
                if (sel.length === 1) {
                    const s = this.shapesLatest.find((sh) => sh.id === sel[0]);
                    if (s && s.type !== 'group') this.ui.snapshot.activateEditing(s.id);
                }
            } else if (e.key === 'Escape') {
                // Layered, innermost state first. While placing a multi-point line Escape
                // *keeps* it — finishMultiPoint commits once two anchors are down and
                // discards a stillborn one — so ending the gesture never loses work.
                if (this.controller.getInteraction().kind === 'arrow-multi') {
                    this.controller.finishMultiPoint();
                    return;
                }
                const store = this.ui.snapshot;
                if (store.pointEditNodes.length) {
                    store.setPointEditNodes([]);
                    return;
                }
                if (store.pointEditId) {
                    store.setPointEditing(null);
                    return;
                }
                store.clearSelection();
                this.controller.reset();
            } else if (e.shiftKey && e.code === 'Digit1') {
                const bounds = this.shapeRegistry.unionBounds(this.shapesLatest);
                if (bounds) {
                    this.ui.snapshot.setCamera(CameraMath.fitBounds(bounds, this.size.width, this.size.height));
                }
            } else if (e.shiftKey && e.code === 'Digit2') {
                // A selected group has no bounds of its own (a zero box at its anchor) — fit
                // its concrete member leaves instead, same expansion move/rotate/align use.
                const members = this.ui.snapshot.selection.flatMap(
                    (id) => SceneTree.boundableDescendants(this.shapesLatest, id),
                );
                const bounds = this.shapeRegistry.unionBounds(members);
                if (bounds) {
                    this.ui.snapshot.setCamera(CameraMath.fitBounds(bounds, this.size.width, this.size.height));
                }
            } else if (e.key === 'v' || e.key === '1') {
                this.ui.snapshot.setTool('select');
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                this.spaceDown = false;
                this.ui.snapshot.setSpacePan(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        this.cleanups.push(() => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        });

        // --- Pointer handlers ---
        const toPointerInfo = (e: PointerEvent): PointerInfo => {
            const rect = canvas.getBoundingClientRect();
            const cam = this.ui.snapshot.camera;
            const world = CameraMath.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, cam);
            return { x: world.x, y: world.y, clientX: e.clientX, clientY: e.clientY, button: e.button, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey };
        };

        const onPointerDown = (e: PointerEvent) => {
            (e.target as Element).setPointerCapture(e.pointerId);
            const p = toPointerInfo(e);
            this.maybeExitGroupScope(p);
            this.controller.onPointerDown(p, this.spaceDown);
            this.scheduleRender();
        };
        const onPointerMove = (e: PointerEvent) => {
            const p = toPointerInfo(e);
            const rect = canvas.getBoundingClientRect();
            this.lastPointerScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            this.canvasDocument.awareness.setLocalStateField('cursor', { x: p.x, y: p.y });
            this.controller.onPointerMove(p, e.shiftKey);
            this.handleCursor.set(this.controller.getCursor());
            this.scheduleRender();
        };
        const onPointerUp = (e: PointerEvent) => {
            this.controller.onPointerUp();
            this.scheduleRender();
            try {
                (e.target as Element).releasePointerCapture(e.pointerId);
            } catch {
                /* pointer already released */
            }
        };
        const onPointerLeave = () => {
            this.canvasDocument.awareness.setLocalStateField('cursor', null);
            this.controller.onPointerLeave();
            this.handleCursor.set(null);
        };
        const onDoubleClick = (e: MouseEvent) => {
            // The second click of a double-click that finishes a multi-point line
            // already went through onPointerDown/stepMultiPoint; this just makes sure
            // the dblclick itself doesn't fall through to caption-editing on the shape
            // it just created (finishMultiPoint is a no-op if it already finished).
            if (this.controller.getInteraction().kind === 'arrow-multi') {
                this.controller.finishMultiPoint();
                return;
            }
            const rect = canvas.getBoundingClientRect();
            const cam = this.ui.snapshot.camera;
            const world = CameraMath.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, cam);
            const hit = this.shapeRegistry.topShapeAt(this.shapesLatest, world.x, world.y);
            if (!hit) return;
            const store = this.ui.snapshot;
            // If the hit resolves to a group we're not yet scoped into, enter it and
            // select the member directly under it (descending one level per dblclick).
            const container = SceneTree.resolveContainer(this.shapesLatest, hit.id, store.editingGroupId);
            const containerShape = this.shapesLatest.find((s) => s.id === container);
            if (containerShape?.type === 'group') {
                store.setEditingGroup(container);
                store.setSelection([SceneTree.resolveContainer(this.shapesLatest, hit.id, container)]);
                return;
            }
            // Lines/arrows enter point-edit mode (midpoint insert handles); caption
            // editing for them moved to Enter. Everything else edits its caption/body.
            if (hit.type === 'arrow') {
                store.setSelection([hit.id]);
                store.setPointEditing(hit.id);
                return;
            }
            store.setSelection([hit.id]);
            store.setEditing(hit.id);
        };
        const onWheel = (e: WheelEvent) => {
            // The canvas fills the viewport, so we own all wheel input — never let the
            // browser page-zoom (Ctrl+wheel) or scroll.
            e.preventDefault();
            const store = this.ui.snapshot;
            const rect = canvas.getBoundingClientRect();
            const pinchZoomGain = 0.008;
            const wheelZoomGain = 0.001;
            if (e.ctrlKey || e.metaKey) {
                const ax = e.clientX - rect.left;
                const ay = e.clientY - rect.top;
                const isPinchGesture = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(e.deltaY) < 40;
                const gain = isPinchGesture ? pinchZoomGain : wheelZoomGain;
                const factor = Math.exp(-e.deltaY * gain);
                store.setCamera(CameraMath.zoomAt(store.camera, factor, ax, ay));
            } else {
                const cam = store.camera;
                // Shift forces horizontal panning (many mice only emit deltaY).
                const horizontal = e.shiftKey && e.deltaX === 0;
                const dx = horizontal ? e.deltaY : e.deltaX;
                const dy = horizontal ? 0 : e.deltaY;
                store.setCamera({ ...cam, x: cam.x + dx / cam.zoom, y: cam.y + dy / cam.zoom });
            }
        };
        const onContextMenu = (e: Event) => e.preventDefault();

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointerleave', onPointerLeave);
        canvas.addEventListener('dblclick', onDoubleClick);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('contextmenu', onContextMenu);
        this.cleanups.push(() => {
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointerleave', onPointerLeave);
            canvas.removeEventListener('dblclick', onDoubleClick);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('contextmenu', onContextMenu);
        });
    }

    public ngOnDestroy(): void {
        this.ro?.disconnect();
        for (const cleanup of this.cleanups) cleanup();
    }

    /** Leave the entered-group scope when a pointer-down lands outside that group's
     *  bounds — clicking within it (empty space or a member) keeps you scoped. */
    private maybeExitGroupScope(p: PointerInfo): void {
        const store = this.ui.snapshot;
        const gid = store.editingGroupId;
        if (!gid) return;
        const members = SceneTree.boundableDescendants(this.shapesLatest, gid);
        // A click on any member keeps you scoped even when that member's rotated
        // hit area extends past the group's axis-aligned box, so hit-test the
        // members first; the union-bounds check only covers empty space inside
        // the frame.
        if (members.some((s) => this.shapeRegistry.hitTest(s, p.x, p.y))) return;
        const bounds = this.shapeRegistry.unionBounds(members);
        const pad = Handles.SELECTION_PAD / store.camera.zoom;
        if (!bounds || !Geometry.pointInBounds(p.x, p.y, bounds, pad)) store.setEditingGroup(null);
    }

    /** Remove the point-edit node selection from its line, keeping at least two anchors
     *  (see `ArrowPoints.removeAnchors`). Returns whether Delete was handled here, so the
     *  caller can skip deleting the whole shape. */
    private deleteSelectedNodes(): boolean {
        const store = this.ui.snapshot;
        if (!store.pointEditId || !store.pointEditNodes.length) return false;
        const shape = this.shapesLatest.find((s) => s.id === store.pointEditId);
        if (shape?.type === 'arrow') {
            const points = ArrowPoints.removeAnchors(shape.points, store.pointEditNodes);
            if (points) this.canvasDocument.updateShapes([{ id: shape.id, patch: { points } }]);
        }
        store.setPointEditNodes([]); // the surviving anchors have shifted; indices are stale
        return true;
    }

    /** Paste at the pointer, or the viewport center if the pointer hasn't been over the canvas yet.
     *  The world anchor is captured synchronously (before the async clipboard read) so paste lands
     *  where the pointer was at keypress. */
    private pasteAtPointer(): void {
        const screen = this.lastPointerScreen ?? { x: this.size.width / 2, y: this.size.height / 2 };
        const world = CameraMath.screenToWorld(screen.x, screen.y, this.ui.snapshot.camera);
        void this.clipboard.paste(world.x, world.y);
    }

    protected peerTransform(cursor: { x: number; y: number }): string {
        const camera = this.ui.snapshot.camera;
        const sx = (cursor.x - camera.x) * camera.zoom;
        const sy = (cursor.y - camera.y) * camera.zoom;
        return `translate(${sx}px, ${sy}px)`;
    }

    private drawNow(): void {
        const canvas = this.canvasRef().nativeElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { camera, selection: sel, editingId, editingGroupId, pointEditId, pointEditNodes, snapToGrid } = this.ui.snapshot;
        const inter = this.controller.getInteraction();

        let draft: Shape | null = null;
        let draftAnchors: readonly number[] | null = null;
        let marquee: Bounds | null = null;
        if (inter.kind === 'create' || inter.kind === 'draw') draft = inter.draft;
        else if (inter.kind === 'arrow-multi') {
            draft = inter.builder.preview();
            draftAnchors = inter.builder.placedAnchors();
        } else if (inter.kind === 'marquee') {
            marquee = { x: inter.startX, y: inter.startY, w: inter.curX - inter.startX, h: inter.curY - inter.startY };
        }

        const { width, height, dpr } = this.size;
        this.sceneRenderer.render({
            ctx, width, height, dpr, camera,
            shapes: this.shapesLatest,
            selection: sel,
            peers: this.peersLatest,
            marquee, draft, draftAnchors, editingId, editingGroupId, pointEditId, pointEditNodes,
            showGrid: snapToGrid,
            rotatingSelection: inter.kind === 'rotate-selection',
        });
    }

    private scheduleRender(): void {
        if (this.rafScheduled) return;
        this.rafScheduled = true;
        requestAnimationFrame(() => {
            this.rafScheduled = false;
            this.drawNow();
        });
    }
}
