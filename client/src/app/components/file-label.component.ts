import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrentFileService } from '../state/current-file.service';

/** Shows the filename the board is bound to (after Save-As / Open) in the lower-left corner. */
@Component({
    selector: 'app-file-label',
    standalone: true,
    templateUrl: './file-label.component.html',
    styleUrl: './file-label.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileLabelComponent {
    protected readonly name = inject(CurrentFileService).name;
}
