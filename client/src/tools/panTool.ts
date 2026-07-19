import type { Interaction, PointerInfo } from '../interaction/interaction';
import type { Tool, ToolContext } from './tool';
import { NO_PANEL_CAPABILITIES } from './tool';

export class PanTool implements Tool {
    public readonly panelCapabilities = NO_PANEL_CAPABILITIES;

    public onPointerDown(_ctx: ToolContext, p: PointerInfo): Interaction {
        return { kind: 'pan', lastX: p.clientX, lastY: p.clientY };
    }
}
