/** Enable only after the dashboard migration and its privileges are verified. */
export function dashboardReleaseEnabled(bindings: { DASHBOARD_RELEASE_ENABLED?: string } | undefined): boolean {
  return bindings?.DASHBOARD_RELEASE_ENABLED === 'true';
}
