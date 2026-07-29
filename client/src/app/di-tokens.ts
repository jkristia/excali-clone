import { InjectionToken } from '@angular/core';
import type { ShapeRegistry } from '../shapes/shapeRegistry';
import type { ToolRegistry } from '../tools/toolRegistry';
import type { UIStore } from '../state/uiStore';
import type { RecentColorsStore } from '../state/recentColors';
import type { CanvasDocument } from '../document/canvasDocument';
import type { SceneRenderer } from '../canvas/render';
import type { TextMeasure } from '../util/textMeasure';
import type { ClipboardController } from '../interaction/clipboardController';
import type { DocumentFile } from '../document/documentFile';
import type { ImageCache } from '../util/imageCache';

/**
 * DI tokens for the framework-agnostic singletons. They are instantiated once in
 * `main.ts` (the composition root) and provided as values, so the Angular layer
 * `inject()`s them instead of importing module-level globals. This is the only
 * place the `app/` shell learns about those plain-TS classes.
 */
export const SHAPE_REGISTRY = new InjectionToken<ShapeRegistry>('SHAPE_REGISTRY');
export const TOOL_REGISTRY = new InjectionToken<ToolRegistry>('TOOL_REGISTRY');
export const UI_STORE = new InjectionToken<UIStore>('UI_STORE');
export const RECENT_COLORS = new InjectionToken<RecentColorsStore>('RECENT_COLORS');
export const CANVAS_DOCUMENT = new InjectionToken<CanvasDocument>('CANVAS_DOCUMENT');
export const SCENE_RENDERER = new InjectionToken<SceneRenderer>('SCENE_RENDERER');
export const TEXT_MEASURE = new InjectionToken<TextMeasure>('TEXT_MEASURE');
export const CLIPBOARD_CONTROLLER = new InjectionToken<ClipboardController>('CLIPBOARD_CONTROLLER');
export const DOCUMENT_FILE = new InjectionToken<DocumentFile>('DOCUMENT_FILE');
export const IMAGE_CACHE = new InjectionToken<ImageCache>('IMAGE_CACHE');
