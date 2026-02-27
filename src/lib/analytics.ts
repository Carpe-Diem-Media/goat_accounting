import { browser } from '$app/environment';

type DataLayerValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | DataLayerObject
  | DataLayerValue[];

type DataLayerObject = { [key: string]: DataLayerValue };

type AnalyticsWindow = Window & {
  dataLayer?: DataLayerObject[];
};

function getDataLayer(): DataLayerObject[] {
  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
  return analyticsWindow.dataLayer;
}

export function pushDataLayer(event: DataLayerObject): void {
  if (!browser) return;
  getDataLayer().push(event);
}

export function trackVirtualPageView(): void {
  if (!browser) return;

  pushDataLayer({
    event: 'virtual_page_view',
    page_title: document.title,
    page_path: `${window.location.pathname}${window.location.search}`,
    page_location: window.location.href,
  });
}

export function trackEvent(event: string, params: DataLayerObject = {}): void {
  pushDataLayer({ event, ...params });
}
