import { devices, expect, test } from '@playwright/test';
import prisma from '../../src/lib/prisma';

// Test running on mobile viewport: Pixel 5
test.use({
  ...devices['Pixel 5'],
  storageState: { cookies: [], origins: [] },
});

test.describe('Live Forge: Gate 1 Critical Path Acceptance @smoke', () => {
  test.describe.configure({ mode: 'serial' });
  let testUserId: string;

  test.beforeAll(async () => {
    // Strict safety guards: verify non-production and explicit test DB
    expect(process.env.NODE_ENV).not.toBe('production');
    expect(process.env.IRONFORGE_E2E_MODE).toBe('true');
    const rawDbUrl = process.env.DATABASE_URL || '';
    expect(rawDbUrl).toBeTruthy();

    const parsedUrl = new URL(rawDbUrl);
    const dbName = parsedUrl.pathname.replace(/^\//, '');
    expect(dbName).toBe('ironforge_test');
  });

  test.beforeEach(async () => {
    testUserId = process.env.IRONFORGE_E2E_USER_ID || 'e2e-gate1-user';

    // Ensure deterministic test user exists
    let user = await prisma.user.findUnique({ where: { id: testUserId }, select: { id: true } });
    if (!user) {
      user = await prisma.user.create({
        data: { id: testUserId, heroName: 'E2E Tester' },
        select: { id: true },
      });
    }

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

  test('proves uncertain-response network retry: write succeeds on server, client response drops, retry acknowledges exactly one set', async ({
    page,
  }) => {
    // 1. Open /live
    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    // 2. Start A1
    await expect(page.getByTestId('start-a1-button')).toBeVisible();
    await page.getByTestId('start-a1-button').click();

    // 3. Verify Belt Squat is active
    await expect(page.getByTestId('mobile-strength-logger')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Belt Squat/i })).toBeVisible();

    // 4. Enter Belt Squat Set 1 (120 kg, 5 reps)
    const loadInput = page.locator('#input-load');
    const repsInput = page.locator('#input-reps');
    await loadInput.fill('120');
    await repsInput.fill('5');

    // 5. Intercept Next.js Server Action POST request:
    // Let request reach server and complete (writing set to DB),
    // but abort the response on the client side to simulate connection drop / timeout
    let abortedOnce = false;
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.method() === 'POST' && !abortedOnce) {
        abortedOnce = true;
        // Execute the request on the server so the DB row is inserted
        await route.fetch();
        // Abort the client's connection before it receives the response
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    const saveButton = page.getByTestId('save-set-button');
    await saveButton.click();

    // 6. Verify client shows failure message and set is not yet displayed as acknowledged
    await expect(page.getByText(/Failed to fetch|Kunde inte spara set|Ett fel uppstod/i).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('logged-set-item')).toHaveCount(0);

    // 7. Unroute the interception so subsequent network requests succeed normally
    await page.unrouteAll({ behavior: 'ignoreErrors' });

    // 8. User retries saving the same set (inputs remain populated, pendingClientWriteId unchanged)
    await saveButton.click();

    // 9. Verify UI confirms set is acknowledged without throwing duplicate error
    await expect(page.getByTestId('logged-set-item')).toHaveCount(1);
    await expect(page.getByTestId('logged-set-item')).toContainText('120kg × 5r');

    // 10. Refresh page to confirm database state is intact and contains exactly one set
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('logged-set-item')).toHaveCount(1);
    await expect(page.getByTestId('logged-set-item')).toContainText('120kg × 5r');

    // 11. Finish workout and verify history reflects exactly one set
    await page.getByTestId('klar-for-idag-button').click();
    await page.waitForURL('**/live/history', { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    const historySetItems = page.getByTestId('history-set-item');
    await expect(historySetItems).toHaveCount(1);
    await expect(historySetItems.nth(0)).toHaveText('120 kg × 5');
  });
});
