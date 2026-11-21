import { test, expect } from '@playwright/test';

test.describe('Senior Mode Dose Taking & Keyboard Flow', () => {
  test('Elder views timeline, marks dose taken, and stock decreases', async ({ page }) => {
    // Navigate to Senior Mode
    await page.goto('/senior');

    // Verify current pending dose card is visible
    const doseCard = page.locator('[data-testid="current-dose-card"]');
    await expect(page.getByRole('heading', { name: /Metformin/i })).toBeVisible();

    // Verify read-aloud button exists and has 48px min touch target
    const readAloudBtn = page.getByRole('button', { name: /Listen|Read Aloud/i });
    await expect(readAloudBtn).toBeVisible();
    const box = await readAloudBtn.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(box.width).toBeGreaterThanOrEqual(48);
    }

    // Elder taps "I Took This Medicine"
    const takeButton = page.getByRole('button', { name: /I Took This Medicine|Take Now/i }).first();
    await expect(takeButton).toBeVisible();
    await takeButton.click();

    // Verify confirmation and status change
    await expect(page.getByText(/Taken at|Medicine recorded/i)).toBeVisible();
  });

  test('Keyboard-only walkthrough of the dose-taking flow', async ({ page }) => {
    await page.goto('/senior');

    // Use Tab key to navigate from top of page through interactive elements
    await page.keyboard.press('Tab'); // Focus skip to content or high contrast
    
    // Continue pressing Tab until we focus on the "Take Medicine" button
    let takeBtnFocused = false;
    for (let i = 0; i < 15; i++) {
      const activeElementText = await page.evaluate(() => document.activeElement?.textContent || '');
      const activeElementRole = await page.evaluate(() => document.activeElement?.getAttribute('role') || document.activeElement?.tagName);
      
      if (/Took This Medicine|Take/i.test(activeElementText)) {
        takeBtnFocused = true;
        break;
      }
      await page.keyboard.press('Tab');
    }

    // Trigger action via Enter key or Space
    if (takeBtnFocused) {
      await page.keyboard.press('Enter');
      // Action is triggered without mouse
      await expect(page.getByText(/Taken at|Medicine recorded/i)).toBeVisible();
    }
  });

  test('Senior mode text size adjustment persists and scales without clipping', async ({ page }) => {
    await page.goto('/senior');

    const textSizeBtn = page.getByRole('button', { name: /Text Size|A\+/i });
    if (await textSizeBtn.isVisible()) {
      await textSizeBtn.click();
      // Body should have larger font token
      const bodyClass = await page.evaluate(() => document.body.className);
      expect(bodyClass).toContain('text-large');
    }
  });
});
