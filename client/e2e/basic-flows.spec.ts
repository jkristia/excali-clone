import { test, expect } from '@playwright/test';

/**
 * Coarse smoke tests over flows still trapped in the God component
 * (Whiteboard.tsx's pointer handlers / interaction state machine). Vitest
 * can't reach these yet; Playwright is the only net until Phase 3 extracts
 * InteractionController and these gain unit coverage. Each test uses its own
 * `?room=` so runs don't collide over the shared Yjs document.
 */
test.beforeEach(async ({ page }, testInfo) => {
    await page.goto(`/?room=e2e-${testInfo.testId}`);
    await expect(page.locator('canvas')).toBeVisible();
});

test('draw a rectangle: tool activates, commit returns to select, shape becomes selectable', async ({ page }) => {
    const rectBtn = page.getByTitle('Rectangle (R)');
    await rectBtn.click();
    await expect(rectBtn).toHaveClass(/active/);

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not laid out');

    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 220, box.y + 200);
    await page.mouse.up();

    // Committing a shape returns to the select tool.
    await expect(page.getByTitle('Select (V)')).toHaveClass(/active/);

    // Clicking the drawn shape selects it; the properties panel shows layer ops.
    await page.mouse.click(box.x + 160, box.y + 150);
    await expect(page.locator('.properties-panel .layer-row')).toBeVisible();
});

test('marquee select: dragging an empty-start rectangle over a shape selects it', async ({ page }) => {
    await page.getByTitle('Rectangle (R)').click();
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not laid out');

    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 160);
    await page.mouse.up();

    // Deselect, then marquee-drag around the shape from empty space.
    await page.keyboard.press('Escape');
    await page.mouse.move(box.x + 60, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 220, box.y + 200);
    await page.mouse.up();

    await expect(page.locator('.properties-panel .layer-row')).toBeVisible();
});

test('pan tool activates from the toolbar', async ({ page }) => {
    const panBtn = page.getByTitle('Pan (or hold Space) (H)');
    await panBtn.click();
    await expect(panBtn).toHaveClass(/active/);
});

test('text tool: typing multiple characters accumulates in the inline editor', async ({ page }) => {
    await page.getByTitle('Text (T)').click();
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not laid out');

    await page.mouse.click(box.x + 120, box.y + 120);
    const editor = page.locator('textarea.inline-editor.text');
    await expect(editor).toBeVisible();

    // Regression test: each keystroke used to re-select the textarea's full
    // content (an effect re-running on every synced shape change instead of
    // only when editing starts), so the next char replaced everything typed
    // so far and only the last character survived.
    await editor.pressSequentially('HEY', { delay: 50 });
    await expect(editor).toHaveValue('HEY');
});

/** Canvas redraws are rAF-scheduled, not synchronous with the keydown that
 *  triggered them — wait a frame before screenshotting so the capture reflects
 *  the post-nudge render rather than a race with the still-pending one. */
async function nextFrame(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('nudge: arrow keys move the selection 1px, Shift+arrow moves it 10px', async ({ page }) => {
    await page.getByTitle('Rectangle (R)').click();
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not laid out');

    // Drawn well clear of the properties panel (absolute-positioned over the
    // canvas's left edge, ~192px wide) so screenshots below capture only the
    // shape, not panel chrome.
    await page.mouse.move(box.x + 400, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 460, box.y + 160);
    await page.mouse.up();

    await page.mouse.click(box.x + 430, box.y + 130);
    await expect(page.locator('.properties-panel .layer-row').first()).toBeVisible();

    // Crop wide enough to contain the shape at its original spot and after a
    // small rightward nudge, so every capture below is directly comparable.
    const clip = { x: box.x + 380, y: box.y + 80, width: 120, height: 100 };
    await nextFrame(page);
    const before = await page.screenshot({ clip });

    await page.keyboard.press('ArrowRight');
    await nextFrame(page);
    const after1 = await page.screenshot({ clip });
    expect(after1.equals(before)).toBe(false);

    for (let i = 0; i < 9; i++) {
        await page.keyboard.press('ArrowRight');
    }
    await nextFrame(page);
    const after10 = await page.screenshot({ clip });

    for (let i = 0; i < 10; i++) {
        await page.keyboard.press('ArrowLeft');
    }
    await nextFrame(page);
    const restored = await page.screenshot({ clip });
    expect(restored.equals(before)).toBe(true);

    // Ten 1px nudges must land exactly where one 10px (Shift+arrow) nudge does.
    await page.keyboard.press('Shift+ArrowRight');
    await nextFrame(page);
    const afterShift = await page.screenshot({ clip });
    expect(afterShift.equals(after10)).toBe(true);
    expect(afterShift.equals(before)).toBe(false);
});
