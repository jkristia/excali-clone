import { Component, computed, inject } from '@angular/core';
import { CollabService } from '../collab/collab.service';
import { CANVAS_DOCUMENT } from '../di-tokens';

function initials(name: string): string {
    return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

@Component({
    selector: 'app-presence-bar',
    standalone: true,
    templateUrl: './presence-bar.component.html',
    styleUrl: './presence-bar.component.scss',
})
export class PresenceBarComponent {
    private readonly collab = inject(CollabService);
    private readonly canvasDocument = inject(CANVAS_DOCUMENT);

    protected readonly room = this.canvasDocument.room;
    protected readonly identity = this.canvasDocument.identity;
    protected readonly selfInitials = initials(this.canvasDocument.identity.name);

    protected readonly peers = this.collab.peers;
    protected readonly status = this.collab.status;
    protected readonly visiblePeers = computed(() => this.peers().slice(0, 6));
    protected readonly extraPeerCount = computed(() => Math.max(0, this.peers().length - 6));
    protected readonly statusLabel = computed(() => {
        const s = this.status();
        return s === 'connected' ? 'Live' : s === 'connecting' ? 'Connecting…' : 'Offline';
    });

    protected initials = initials;
}
