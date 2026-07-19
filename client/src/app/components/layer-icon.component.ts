import { Component, Input } from '@angular/core';
import type { ReorderOp } from '../../document/canvasDocument';

/** Small line icons for the layer/z-order operations (arrow ± a target bar). */
@Component({
    selector: 'app-layer-icon',
    standalone: true,
    templateUrl: './layer-icon.component.html',
})
export class LayerIconComponent {
    @Input({ required: true }) public op!: ReorderOp;
}
