import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { PresenceBarComponent } from './components/presence-bar.component';
import { ToolbarComponent } from './components/toolbar.component';
import { PropertiesPanelComponent } from './components/properties-panel.component';
import { WhiteboardComponent } from './whiteboard/whiteboard.component';
import { KeyboardController, defaultIsTyping } from '../interaction/keyboardController';
import { UI_STORE, CANVAS_DOCUMENT } from './di-tokens';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [PresenceBarComponent, ToolbarComponent, PropertiesPanelComponent, WhiteboardComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy {
    private readonly keyboard = new KeyboardController(inject(UI_STORE), inject(CANVAS_DOCUMENT), defaultIsTyping);
    private readonly onKeyDown = (e: KeyboardEvent) => this.keyboard.handleKeyDown(e);

    public ngOnInit(): void {
        window.addEventListener('keydown', this.onKeyDown);
    }

    public ngOnDestroy(): void {
        window.removeEventListener('keydown', this.onKeyDown);
    }
}
