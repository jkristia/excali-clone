import { Component, Input } from '@angular/core';
import type { AlignOp } from '../../util/shapeAligner';

/** Small line icons for the six shape-alignment operations: two boxes lined up against a
 *  heavier reference edge (or a center axis for the hcenter/vcenter cases). Distinct from
 *  `align-icon.component`, which is text justification. */
@Component({
    selector: 'app-align-shapes-icon',
    standalone: true,
    templateUrl: './align-shapes-icon.component.html',
})
export class AlignShapesIconComponent {
    @Input({ required: true }) public op!: AlignOp;
}
