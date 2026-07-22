import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ConfirmDialogService } from './confirm-dialog.service';

/**
 * App-level modal confirm dialog — mounted once at the shell root, hidden until
 * {@link ConfirmDialogService.ask} opens it. Escape / overlay click cancels; Enter
 * confirms. Replaces the browser's native `window.confirm` with a styled overlay.
 */
@Component({
    selector: 'app-confirm-dialog',
    standalone: true,
    templateUrl: './confirm-dialog.component.html',
    styleUrl: './confirm-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent implements OnInit, OnDestroy {
    private readonly service = inject(ConfirmDialogService);
    protected readonly request = this.service.request;

    // Capture phase so Enter/Escape settle the dialog before global shortcuts see them.
    private readonly onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);

    public ngOnInit(): void {
        window.addEventListener('keydown', this.onKeyDown, true);
    }

    public ngOnDestroy(): void {
        window.removeEventListener('keydown', this.onKeyDown, true);
    }

    protected confirm(): void {
        this.service.confirm();
    }

    protected cancel(): void {
        this.service.cancel();
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (!this.request()) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.cancel();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            this.confirm();
        }
    }
}
