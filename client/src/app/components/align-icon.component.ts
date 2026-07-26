import { Component, Input } from '@angular/core';
import type { TextAlign } from '../../model/shapeTypes';

/** Small line icon for text horizontal-alignment (three rows justified left/center/right). */
@Component({
    selector: 'app-align-icon',
    standalone: true,
    templateUrl: './align-icon.component.html',
})
export class AlignIconComponent {
    @Input({ required: true }) public align!: TextAlign;
}
