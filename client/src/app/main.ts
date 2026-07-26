import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { ToolRegistry } from '../tools/toolRegistry';
import { UIStore } from '../state/uiStore';
import { RecentColorsStore } from '../state/recentColors';
import { CanvasDocument } from '../document/canvasDocument';
import { IdentityStore } from '../document/identity';
import { SceneRenderer } from '../canvas/render';
import { TextMeasure } from '../util/textMeasure';
import { ClipboardController } from '../interaction/clipboardController';
import { DocumentFile } from '../document/documentFile';
import { SHAPE_REGISTRY, TOOL_REGISTRY, UI_STORE, RECENT_COLORS, CANVAS_DOCUMENT, SCENE_RENDERER, TEXT_MEASURE, CLIPBOARD_CONTROLLER, DOCUMENT_FILE } from './di-tokens';
import '../index.css';

// Composition root: build the object graph once, in dependency order, then hand
// each instance to Angular DI. No module-level singletons anywhere else.
const shapeRegistry = new ShapeRegistry();
const toolRegistry = new ToolRegistry(shapeRegistry);
const uiStore = new UIStore(toolRegistry);
const recentColorsStore = new RecentColorsStore();
const canvasDocument = new CanvasDocument(new IdentityStore());
const sceneRenderer = new SceneRenderer(shapeRegistry);
const textMeasure = new TextMeasure();
const clipboardController = new ClipboardController(
    uiStore,
    canvasDocument,
    shapeRegistry,
    () => String(canvasDocument.awareness.clientID),
);
const documentFile = new DocumentFile(shapeRegistry);

bootstrapApplication(AppComponent, {
    providers: [
        { provide: SHAPE_REGISTRY, useValue: shapeRegistry },
        { provide: TOOL_REGISTRY, useValue: toolRegistry },
        { provide: UI_STORE, useValue: uiStore },
        { provide: RECENT_COLORS, useValue: recentColorsStore },
        { provide: CANVAS_DOCUMENT, useValue: canvasDocument },
        { provide: SCENE_RENDERER, useValue: sceneRenderer },
        { provide: TEXT_MEASURE, useValue: textMeasure },
        { provide: CLIPBOARD_CONTROLLER, useValue: clipboardController },
        { provide: DOCUMENT_FILE, useValue: documentFile },
    ],
}).catch((err) => console.error(err));
