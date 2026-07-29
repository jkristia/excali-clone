/** Stand-in for the DOM `Image` constructor: exposes `onload`/`onerror` as plain
 *  settable fields (like the real element) so a test can resolve/reject a decode on
 *  demand instead of racing a real image load. Every instance is recorded on the
 *  class so a test can assert how many decodes were actually kicked off. Install with
 *  `vi.stubGlobal('Image', FakeImage)`. */
export class FakeImage {
    public static instances: FakeImage[] = [];
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public src = '';
    public naturalWidth = 100;
    public naturalHeight = 50;

    constructor() {
        FakeImage.instances.push(this);
    }
}
