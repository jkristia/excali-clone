import { Component, ElementRef, OnDestroy, AfterViewInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { UiStoreService } from '../state/ui-store.service';
import { CollabService } from '../collab/collab.service';
import { InlineEditorComponent } from '../components/inline-editor.component';
import type { Bounds, PeerPresence, Shape } from '../../model/types';
import { CameraMath } from '../../canvas/camera';
import { SCENE_RENDERER, CANVAS_DOCUMENT, TOOL_REGISTRY, SHAPE_REGISTRY, CLIPBOARD_CONTROLLER } from '../di-tokens';
import { InteractionController } from '../../interaction/interactionController';
import type { PointerInfo } from '../../interaction/interaction';

/** World-space offset applied to each duplicate, down-right from its source. */
const DUPLICATE_OFFSET = 20;

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

    private readonly author = () => String(this.canvasDocument.awareness.clientID);

    private readonly clipboard = inject(CLIPBOARD_CONTROLLER);

    private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
    private readonly containerRef = viewChild.required<ElementRef<HTMLDivElement>>('container');

    protected readonly shapes = this.collab.shapes;
    protected readonly peers = this.collab.peers;
    private readonly selection = this.ui.select((s) => s.selection);
    private readonly tool = this.ui.select((s) => s.tool);
    private readonly spacePan = this.ui.select((s) => s.spacePan);
    private readonly camera = this.ui.select((s) => s.camera);
    private readonly editingId = this.ui.select((s) => s.editingId);

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
            void this.tool();
            void this.spacePan();
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
                const sel = this.ui.snapshot.selection;
                if (sel.length) {
                    this.canvasDocument.deleteShapes(sel);
                    this.ui.snapshot.clearSelection();
                }
            } else if (e.key === 'Escape') {
                this.ui.snapshot.clearSelection();
                this.controller.reset();
            } else if (e.shiftKey && e.code === 'Digit1') {
                const bounds = this.shapeRegistry.unionBounds(this.shapesLatest);
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
            return { x: world.x, y: world.y, clientX: e.clientX, clientY: e.clientY, button: e.button, shiftKey: e.shiftKey };
        };

        const onPointerDown = (e: PointerEvent) => {
            (e.target as Element).setPointerCapture(e.pointerId);
            this.controller.onPointerDown(toPointerInfo(e), this.spaceDown);
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
            const rect = canvas.getBoundingClientRect();
            const cam = this.ui.snapshot.camera;
            const world = CameraMath.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, cam);
            const hit = this.shapeRegistry.topShapeAt(this.shapesLatest, world.x, world.y);
            if (hit && (hit.type === 'text' || hit.type === 'note')) {
                this.ui.snapshot.setSelection([hit.id]);
                this.ui.snapshot.setEditing(hit.id);
            }
        };
        const onWheel = (e: WheelEvent) => {
            // The canvas fills the viewport, so we own all wheel input — never let the
            // browser page-zoom (Ctrl+wheel) or scroll.
            e.preventDefault();
            const store = this.ui.snapshot;
            const rect = canvas.getBoundingClientRect();
            if (e.ctrlKey || e.metaKey) {
                const ax = e.clientX - rect.left;
                const ay = e.clientY - rect.top;
                const factor = Math.exp(-e.deltaY * 0.001);
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

        const { camera, selection: sel, editingId } = this.ui.snapshot;
        const inter = this.controller.getInteraction();

        let draft: Shape | null = null;
        let marquee: Bounds | null = null;
        if (inter.kind === 'create' || inter.kind === 'draw') draft = inter.draft;
        else if (inter.kind === 'marquee') {
            marquee = { x: inter.startX, y: inter.startY, w: inter.curX - inter.startX, h: inter.curY - inter.startY };
        }

        const { width, height, dpr } = this.size;
        this.sceneRenderer.render({
            ctx, width, height, dpr, camera,
            shapes: this.shapesLatest,
            selection: sel,
            peers: this.peersLatest,
            marquee, draft, editingId,
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
