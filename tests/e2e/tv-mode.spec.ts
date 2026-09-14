import { expect, test } from '@playwright/test';
import { DashboardPage } from './pages/dashboard.page';
import { TVModePage } from './pages/tv-mode.page';

test.describe('TV Mode (Iron Command Center)', () => {
  let dashboard: DashboardPage;
  let tvMode: TVModePage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    tvMode = new TVModePage(page);

    await dashboard.goto();
    // Navigate to Cycling Studio (Ride)
    await dashboard.startRide();
    await expect(page.getByText(/Cycling|Ride/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should launch TV Mode via keyboard shortcut', async ({ page }) => {
    await tvMode.launch();
    await expect(tvMode.tvContainer).toBeVisible();
    await expect(page.getByText('Zone 1')).toBeVisible();
    await expect(tvMode.raidTarget).toBeVisible();
  });

  test('should toggle HUD visibility with Spacebar', async () => {
    await tvMode.launch();
    await expect(tvMode.tvContainer).toBeVisible();

    // Press Space to hide HUD
    await tvMode.toggleHUD();
    await expect(tvMode.raidTarget).not.toBeVisible();

    // Press Space to show HUD
    await tvMode.toggleHUD();
    await expect(tvMode.raidTarget).toBeVisible();
  });

  test('should open Sensor Manager', async ({ page }) => {
    await tvMode.launch();
    await tvMode.openSensorManager();

    await expect(page.getByText('Heart Rate')).toBeVisible();
    await expect(page.getByText('Smart Trainer')).toBeVisible();

    // Close it
    await page.getByText('Done').click();
    await expect(tvMode.sensorManager).not.toBeVisible();
  });

  test('should exit TV Mode with Escape', async ({ page }) => {
    await tvMode.launch();
    await page.waitForTimeout(500);
    await expect(tvMode.tvContainer).toBeVisible({ timeout: 5000 });

    await tvMode.exit();
    await expect(tvMode.tvContainer).not.toBeVisible({ timeout: 5000 });
  });
});
