import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, effect, signal, viewChild, inject } from '@angular/core';
import type { Color } from '../../model/types';
import { PALETTE_SOLID, PALETTE_PASTEL } from '../../util/palette';
import { ColorFlyoutService } from './color-flyout.service';

/** Gap between the trigger button and the flyout, and the flyout's clamp margin
 *  from the viewport edge. */
const VIEWPORT_GAP = 12;
/** Vertical offset from the anchor's top to the caret tip, so the caret lines up
 *  with the flyout's first swatch row when there's no clamping. */
const CARET_INSET = 22;
const CARET_HALF = 7;

interface FlyoutPosition {
    readonly left: number;
    readonly top: number;
    readonly caretTop: number;
    /** true ⇒ flyout sits to the left of the anchor (viewport overflow on the right). */
    readonly flipped: boolean;
}

/**
 * App-level color palette flyout — 16 solid + 16 pastel swatches plus a custom
 * color input. Mounted once at the shell root (sibling of the properties panel,
 * not a descendant of it): `.properties-panel` scrolls (`overflow-y: auto`) and is
 * translated (`transform: translateY(-50%)`), which together would clip *any*
 * absolutely/fixed-positioned descendant that sticks out past its edge. Living
 * outside that subtree and positioning from the anchor's live `getBoundingClientRect()`
 * sidesteps the whole problem.
 */
@Component({
    selector: 'app-color-flyout',
    standalone: true,
    templateUrl: './color-flyout.component.html',
    styleUrl: './color-flyout.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorFlyoutComponent implements OnInit, OnDestroy {
    private readonly service = inject(ColorFlyoutService);
    private readonly flyoutRef = viewChild<ElementRef<HTMLElement>>('flyout');

    protected readonly request = this.service.request;
    protected readonly solids = PALETTE_SOLID;
    protected readonly pastels = PALETTE_PASTEL;
    protected readonly position = signal<FlyoutPosition>({ left: 0, top: 0, caretTop: CARET_INSET, flipped: false });

    private readonly onWindowKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    private readonly onWindowPointerDown = (e: PointerEvent) => this.handlePointerDown(e);

    constructor() {
        // Re-run whenever a new request arrives *or* the flyout element first materializes
        // (viewChild is itself a signal) — one seam covers both "just opened" and "just rendered".
        effect(() => {
            const req = this.request();
            const element = this.flyoutRef()?.nativeElement;
            if (!req || !element) return;
            this.position.set(this.computePosition(req.anchor.getBoundingClientRect(), element.offsetWidth, element.offsetHeight));
        });
    }

    public ngOnInit(): void {
        // Capture phase + stopPropagation (matching ConfirmDialogComponent) so Escape
        // closes the flyout only — otherwise it also bubbles to the whiteboard's own
        // Escape handler, which clears the shape selection underneath.
        window.addEventListener('keydown', this.onWindowKeyDown, true);
        window.addEventListener('pointerdown', this.onWindowPointerDown);
    }

    public ngOnDestroy(): void {
        window.removeEventListener('keydown', this.onWindowKeyDown, true);
        window.removeEventListener('pointerdown', this.onWindowPointerDown);
    }

    protected pick(color: Color): void {
        this.service.pick(color);
    }

    /** `<input type="color">` rejects 'transparent' and short hex, silently resetting
     *  to black — only ever feed it a color it can actually represent. */
    protected customValue(): string {
        const current = this.request()?.current ?? '';
        return /^#[0-9a-f]{6}$/i.test(current) ? current : '#000000';
    }

    /** Bound to `(change)`, not `(input)`: `input` fires continuously while dragging
     *  inside the OS color picker, which would spam a shape patch (and a Yjs
     *  transaction, and an undo entry) on every mouse move. */
    protected pickCustom(event: Event): void {
        this.pick((event.target as HTMLInputElement).value);
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (!this.request()) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.service.dismiss();
        }
    }

    /** Closes on any outside pointerdown — but not on the trigger itself, which
     *  toggles the flyout on its own click; without this exclusion, clicking an
     *  open trigger would close it here and reopen it on the same click. */
    private handlePointerDown(e: PointerEvent): void {
        const req = this.request();
        if (!req) return;
        const target = e.target as Node;
        const element = this.flyoutRef()?.nativeElement;
        if (element?.contains(target) || req.anchor.contains(target)) return;
        this.service.dismiss();
    }

    private computePosition(anchorRect: DOMRect, width: number, height: number): FlyoutPosition {
        const fitsRight = anchorRect.right + VIEWPORT_GAP + width <= window.innerWidth - VIEWPORT_GAP;
        const flipped = !fitsRight;
        const left = flipped ? anchorRect.left - VIEWPORT_GAP - width : anchorRect.right + VIEWPORT_GAP;
        const desiredTop = anchorRect.top + anchorRect.height / 2 - CARET_INSET;
        const top = Math.min(Math.max(desiredTop, VIEWPORT_GAP), window.innerHeight - height - VIEWPORT_GAP);
        const caretTop = anchorRect.top + anchorRect.height / 2 - top - CARET_HALF;
        return { left, top, caretTop, flipped };
    }
}
