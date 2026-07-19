import { Component, computed, inject } from '@angular/core';
import { UiStoreService } from '../state/ui-store.service';
import { CollabService } from '../collab/collab.service';
import { CameraMath } from '../../canvas/camera';
import { SHAPE_REGISTRY } from '../di-tokens';
import type { Tool } from '../../state/uiStore';

interface ToolDef {
    tool: Tool;
    label: string;
    icon: string;
    key: string;
}

const TOOLS: ToolDef[] = [
    { tool: 'select', label: 'Select', icon: '⬚', key: 'V' },
    { tool: 'pan', label: 'Pan (or hold Space)', icon: '✋', key: 'H' },
    { tool: 'rectangle', label: 'Rectangle', icon: '▭', key: 'R' },
    { tool: 'ellipse', label: 'Ellipse', icon: '◯', key: 'O' },
    { tool: 'line', label: 'Line', icon: '╱', key: 'L' },
    { tool: 'arrow', label: 'Arrow', icon: '↗', key: 'A' },
    { tool: 'draw', label: 'Draw', icon: '✎', key: 'P' },
    { tool: 'text', label: 'Text', icon: 'T', key: 'X' },
    { tool: 'note', label: 'Sticky note', icon: '▢', key: 'N' },
];

@Component({
    selector: 'app-toolbar',
    standalone: true,
    templateUrl: './toolbar.component.html',
    styleUrl: './toolbar.component.scss',
})
export class ToolbarComponent {
    private readonly ui = inject(UiStoreService);
    protected readonly collab = inject(CollabService);
    private readonly shapeRegistry = inject(SHAPE_REGISTRY);

    protected readonly tools = TOOLS;
    protected readonly tool = this.ui.select((s) => s.tool);
    protected readonly spacePan = this.ui.select((s) => s.spacePan);
    protected readonly camera = this.ui.select((s) => s.camera);
    protected readonly undoRedo = this.collab.undoRedo;

    protected readonly activeTool = computed(() => (this.spacePan() ? 'pan' : this.tool()));
    protected readonly zoomPct = computed(() => Math.round(this.camera().zoom * 100));

    protected setTool(tool: Tool): void {
        this.ui.snapshot.setTool(tool);
    }

    protected setZoom(z: number): void {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const camera = this.camera();
        const nextZoom = CameraMath.clampZoom(z);
        const worldX = cx / camera.zoom + camera.x;
        const worldY = cy / camera.zoom + camera.y;
        this.ui.snapshot.setCamera({ zoom: nextZoom, x: worldX - cx / nextZoom, y: worldY - cy / nextZoom });
    }

    protected zoomToFit(): void {
        const bounds = this.shapeRegistry.unionBounds(this.collab.shapes());
        if (!bounds) return;
        this.ui.snapshot.setCamera(CameraMath.fitBounds(bounds, window.innerWidth, window.innerHeight));
    }
}
