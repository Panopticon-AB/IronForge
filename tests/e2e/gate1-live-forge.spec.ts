import { devices, expect, test } from '@playwright/test';
import prisma from '../../src/lib/prisma';

// Test running on mobile viewport: Pixel 5
test.use({
  ...devices['Pixel 5'],
  storageState: { cookies: [], origins: [] },
});

test.describe('Live Forge: Gate 1 Critical Path Acceptance @smoke', () => {
  let testUserId: string;

  test.beforeEach(async () => {
    const user =
      (await prisma.user.findFirst({ where: { heroName: 'IronLegend' }, select: { id: true } })) ||
      (await prisma.user.findFirst({ select: { id: true } })) ||
      (await prisma.user.create({ data: { heroName: 'IronLegend' }, select: { id: true } }));
    testUserId = user.id;

    // Clean up active and recent Live Forge sessions for test user to guarantee deterministic start
    const existing = await prisma.strengthEvidenceSession.findMany({
      where: { userId: testUserId, source: 'IRONFORGE_LIVE_FORGE' },
      select: { id: true },
    });
    for (const sess of existing) {
      await prisma.strengthEvidenceSet.deleteMany({ where: { sessionId: sess.id } });
    }
    await prisma.strengthEvidenceSession.deleteMany({
      where: { userId: testUserId, source: 'IRONFORGE_LIVE_FORGE' },
    });
  });

  test.afterEach(async () => {
    if (!testUserId) return;
    const existing = await prisma.strengthEvidenceSession.findMany({
      where: { userId: testUserId, source: 'IRONFORGE_LIVE_FORGE' },
      select: { id: true },
    });
    for (const sess of existing) {
      await prisma.strengthEvidenceSet.deleteMany({ where: { sessionId: sess.id } });
    }
    await prisma.strengthEvidenceSession.deleteMany({
      where: { userId: testUserId, source: 'IRONFORGE_LIVE_FORGE' },
    });
  });

  test('proves the real mobile browser path: /live -> start A1 -> log set -> reload -> resume -> continue -> Klar för idag -> history', async ({
    page,
  }) => {
    // 1. Open /live
    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    // 2. Verify no active session is present and start workout picker is visible
    await expect(page.getByText('Styrkelogg')).toBeVisible();
    await expect(page.getByTestId('start-a1-button')).toBeVisible();

    // 3. Start A1
    await page.getByTestId('start-a1-button').click();

    // 4. Verify Belt Squat is the active exercise
    await expect(page.getByTestId('mobile-strength-logger')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Belt Squat/i })).toBeVisible();

    // 5. Enter Belt Squat Set 1 (100 kg, 8 reps)
    const loadInput = page.locator('#input-load');
    const repsInput = page.locator('#input-reps');
    await expect(loadInput).toBeVisible();
    await expect(repsInput).toBeVisible();

    await loadInput.fill('100');
    await repsInput.fill('8');

    // 6. Save Set 1
    const saveButton = page.getByTestId('save-set-button');
    await saveButton.click();

    // 7. Wait for UI to confirm set is acknowledged
    const loggedSetItem = page.getByTestId('logged-set-item');
    await expect(loggedSetItem).toBeVisible();
    await expect(loggedSetItem).toContainText('100kg × 8r');

    // 8. Real browser refresh
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 9. Verify the session resumed with Belt Squat set 1 intact
    await expect(page.getByTestId('mobile-strength-logger')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Belt Squat/i })).toBeVisible();
    await expect(page.getByTestId('logged-set-item')).toBeVisible();
    await expect(page.getByTestId('logged-set-item')).toContainText('100kg × 8r');

    // 10. Log Belt Squat Set 2 (100 kg, 7 reps)
    await loadInput.fill('100');
    await repsInput.fill('7');
    await saveButton.click();

    // Verify Set 2 is acknowledged and both sets are displayed
    await expect(page.getByTestId('logged-set-item')).toHaveCount(2);
    await expect(page.getByTestId('logged-set-item').nth(1)).toContainText('100kg × 7r');

    // 11. Tap "Klar för idag"
    const klarButton = page.getByTestId('klar-for-idag-button');
    await expect(klarButton).toBeVisible();
    await klarButton.click();

    // 12. Verify navigation to /live/history succeeds
    await page.waitForURL('**/live/history', { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Träningshistorik')).toBeVisible();

    // 13. Reopen /live to verify completed session is NOT active
    await page.goto('/live');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('start-a1-button')).toBeVisible();
    await expect(page.getByTestId('mobile-strength-logger')).not.toBeVisible();

    // 14. Return to /live/history and verify exact sets and outcome
    await page.goto('/live/history');
    await page.waitForLoadState('networkidle');

    const completedList = page.getByTestId('completed-sessions-list');
    await expect(completedList).toBeVisible();
    await expect(completedList).toContainText('KLAR_FOR_IDAG');
    await expect(completedList).toContainText('Belt Squat');

    // Verify exactly the two sets appear
    const historySetItems = page.getByTestId('history-set-item');
    await expect(historySetItems).toHaveCount(2);
    await expect(historySetItems.nth(0)).toHaveText('100 kg × 8');
    await expect(historySetItems.nth(1)).toHaveText('100 kg × 7');
  });
});
