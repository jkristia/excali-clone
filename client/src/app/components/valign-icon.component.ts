import { Component, Input } from '@angular/core';
import type { VerticalAlign } from '../../model/types';

/** Small line icon for caption vertical-alignment (three rows clustered top/middle/bottom). */
@Component({
    selector: 'app-valign-icon',
    standalone: true,
    templateUrl: './valign-icon.component.html',
})
export class ValignIconComponent {
    @Input({ required: true }) public align!: VerticalAlign;
}
