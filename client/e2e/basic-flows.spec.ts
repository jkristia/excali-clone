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

/** The properties panel is absolutely positioned over the canvas's left edge (~192px
 *  wide, full height) and the toolbar runs along the bottom, so a drag has to start in
 *  the clear middle band — otherwise the pointer lands on panel chrome and the canvas
 *  never sees the gesture at all. */
const CLEAR_BAND = { left: 400, top: 100 };

/** Drags a shape with the already-active create tool, well clear of the panel and
 *  toolbar, and returns the drawn shape's center in page coordinates. */
async function dragShape(page: import('@playwright/test').Page, width = 120, height = 100): Promise<{ x: number; y: number }> {
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('canvas not laid out');
    const startX = box.x + CLEAR_BAND.left;
    const startY = box.y + CLEAR_BAND.top;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + width, startY + height);
    await page.mouse.up();
    return { x: startX + width / 2, y: startY + height / 2 };
}

test('draw a rectangle: tool activates, commit returns to select, shape becomes selectable', async ({ page }) => {
    const rectBtn = page.getByTitle('Rectangle (R)');
    await rectBtn.click();
    await expect(rectBtn).toHaveClass(/active/);

    const center = await dragShape(page);

    // Committing a shape returns to the select tool.
    await expect(page.getByTitle('Select (V)')).toHaveClass(/active/);

    // Clicking the drawn shape selects it; the properties panel shows layer ops.
    await page.mouse.click(center.x, center.y);
    // Two layer rows exist (layer ops + alignment), so scope to the first.
    await expect(page.locator('.properties-panel .layer-row').first()).toBeVisible();
});

test('marquee select: dragging an empty-start rectangle over a shape selects it', async ({ page }) => {
    await page.getByTitle('Rectangle (R)').click();
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('canvas not laid out');
    await dragShape(page, 80, 60);

    // Deselect, then marquee-drag around the shape from empty space.
    await page.keyboard.press('Escape');
    await page.mouse.move(box.x + CLEAR_BAND.left - 40, box.y + CLEAR_BAND.top - 40);
    await page.mouse.down();
    await page.mouse.move(box.x + CLEAR_BAND.left + 120, box.y + CLEAR_BAND.top + 100);
    await page.mouse.up();

    // Two layer rows exist (layer ops + alignment), so scope to the first.
    await expect(page.locator('.properties-panel .layer-row').first()).toBeVisible();
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

test('sloppiness: switching to Medium marks the button active and re-sketches the shape', async ({ page }) => {
    await page.getByTitle('Rectangle (R)').click();
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas not laid out');

    // Drawn clear of the properties panel, same as the nudge test, so the clip
    // below captures only the shape.
    await page.mouse.move(box.x + 400, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 460, box.y + 160);
    await page.mouse.up();
    await page.mouse.click(box.x + 430, box.y + 130);

    const panel = page.locator('.properties-panel');
    await expect(panel).toBeVisible();
    const plainBtn = panel.getByTitle('Plain');
    const mediumBtn = panel.getByTitle('Medium');
    await expect(plainBtn).toHaveClass(/active/); // 'plain' is the default sloppiness

    const clip = { x: box.x + 380, y: box.y + 80, width: 120, height: 100 };
    await nextFrame(page);
    const before = await page.screenshot({ clip });

    await mediumBtn.click();
    await expect(mediumBtn).toHaveClass(/active/);
    await expect(plainBtn).not.toHaveClass(/active/);
    await nextFrame(page);
    const after = await page.screenshot({ clip });
    expect(after.equals(before)).toBe(false);
});

test('stroke color flyout: opens unclipped beside the panel, picking a color updates the shape and the quick row', async ({ page }) => {
    await page.getByTitle('Rectangle (R)').click();
    const center = await dragShape(page);
    await page.mouse.click(center.x, center.y);

    const panel = page.locator('.properties-panel');
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    if (!panelBox) throw new Error('panel not laid out');

    const anchor = panel.getByTitle('More colors').first();
    const anchorBox = await anchor.boundingBox();
    if (!anchorBox) throw new Error('trigger not laid out');
    await anchor.click();
    const flyout = page.locator('.color-flyout');
    await expect(flyout).toBeVisible();
    const flyoutBox = await flyout.boundingBox();
    if (!flyoutBox) throw new Error('flyout not laid out');
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport');

    // Regression test for the clipping trap: `.properties-panel` scrolls and is
    // transformed, which would clip a flyout mounted inside it. Measured against the
    // trigger and the panel's *far* edge, not the panel's padded left box — the flyout's
    // 12px gap from the trigger is narrower than the panel's own right padding.
    expect(flyoutBox.x).toBeGreaterThanOrEqual(anchorBox.x + anchorBox.width);
    expect(flyoutBox.x + flyoutBox.width).toBeGreaterThan(panelBox.x + panelBox.width);
    // ...and it is fully on screen, i.e. not clipped by the viewport either.
    expect(flyoutBox.x + flyoutBox.width).toBeLessThanOrEqual(viewport.width);
    expect(flyoutBox.y + flyoutBox.height).toBeLessThanOrEqual(viewport.height);

    await flyout.locator('.swatch').first().click();
    await expect(flyout).toBeHidden();
    await expect(panel.locator('.swatch-row').first().locator('.swatch').nth(2)).toBeVisible();
});

test('palette flyout: neutral row is fixed, and a custom pick joins one shared MRU row', async ({ page }) => {
    await page.getByTitle('Rectangle (R)').click();
    const center = await dragShape(page);
    await page.mouse.click(center.x, center.y);

    const panel = page.locator('.properties-panel');
    const flyout = page.locator('.color-flyout');
    const openStroke = async () => {
        await panel.locator('.prop-section', { hasText: 'Stroke' }).getByTitle('More colors').click();
        await expect(flyout).toBeVisible();
    };

    await openStroke();
    // Solid, pastel and the new neutral ramp — 8 columns each, custom row still absent.
    await expect(flyout.locator('.swatch-grid:not(.custom-swatches)')).toHaveCount(3);
    await expect(flyout.locator('.swatch-grid').nth(2).locator('.swatch')).toHaveCount(8);
    await expect(flyout.locator('.custom-swatches')).toHaveCount(0);

    // The OS picker can't be driven for real, but its `change` event is what the app binds to.
    await flyout.locator('.custom-input').evaluate((el: HTMLInputElement) => {
        el.value = '#abcdef';
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(flyout).toBeHidden();

    await openStroke();
    const customs = flyout.locator('.custom-swatches .swatch');
    await expect(customs).toHaveCount(1);
    await expect(customs.first()).toHaveCSS('background-color', 'rgb(171, 205, 239)');
    await page.keyboard.press('Escape');

    // One shared list: the color mixed for the stroke is offered again for the fill.
    await panel.locator('.prop-section', { hasText: 'Fill' }).first().getByTitle('More colors').click();
    await expect(flyout.locator('.custom-swatches .swatch')).toHaveCount(1);
});
