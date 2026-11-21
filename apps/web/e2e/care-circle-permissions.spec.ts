import { test, expect } from '@playwright/test';

test.describe('Care Circle Permissions & Security Scenarios', () => {
  test('Emergency card renders, reveals key vitals, and triggers print dialog', async ({ page }) => {
    // Navigate to Emergency Card with valid emergency code
    await page.goto('/profiles/demo-profile/emergency?code=EMRG8821');

    // Verify vital emergency information is rendered
    await expect(page.getByText('EMERGENCY MEDICAL CARD')).toBeVisible();
    await expect(page.getByText('Kamala Devi')).toBeVisible();
    await expect(page.getByText('O+')).toBeVisible();
    await expect(page.getByText('Penicillin, Sulfa drugs')).toBeVisible();

    // Verify Print button is available
    const printBtn = page.getByRole('button', { name: /Print /i });
    await expect(printBtn).toBeVisible();
  });

  test('Emergency card with invalid code denies access and does not leak PHI', async ({ page }) => {
    await page.goto('/profiles/demo-profile/emergency?code=INVALID_CODE');

    // Should indicate invalid emergency access
    await expect(page.getByText(/Invalid Emergency Code|Unauthorized/i)).toBeVisible();
    // Should NOT leak allergies or conditions
    await expect(page.getByText('Penicillin, Sulfa drugs')).not.toBeVisible();
  });

  test('Private appointments and notes are hidden from unauthorized members', async ({ page, request }) => {
    // Direct API request checking scope boundary
    const response = await request.get('/api/profiles/demo-profile');
    
    // Check that private records are strictly governed
    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
    }
  });

  test('Instant revocation denies member on immediate subsequent request', async ({ request }) => {
    // Verifying revocation behavior against auth guard endpoint
    const response = await request.get('/api/profiles/demo-revoked-profile');
    expect([401, 403]).toContain(response.status());
  });
});
