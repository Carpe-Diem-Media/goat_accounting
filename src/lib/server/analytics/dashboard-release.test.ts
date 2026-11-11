import { expect, test } from 'bun:test';
import { dashboardReleaseEnabled } from './dashboard-release';

test('dashboard release requires an explicit enabled binding', () => {
  expect(dashboardReleaseEnabled(undefined)).toBe(false);
  expect(dashboardReleaseEnabled({})).toBe(false);
  expect(dashboardReleaseEnabled({ DASHBOARD_RELEASE_ENABLED: 'false' })).toBe(false);
  expect(dashboardReleaseEnabled({ DASHBOARD_RELEASE_ENABLED: 'true' })).toBe(true);
});
