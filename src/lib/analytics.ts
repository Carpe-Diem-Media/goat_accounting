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
  if (typeof window === 'undefined') return;
  getDataLayer().push(event);
}

export function trackVirtualPageView(): void {
  if (typeof window === 'undefined') return;

  pushDataLayer({
    event: 'virtual_page_view',
    page_title: document.title,
    ...safePageLocation(window.location.href),
  });
}

export function trackEvent(event: string, params: DataLayerObject = {}): void {
  pushDataLayer({ event, ...params });
}
export function safePageLocation(href: string): { page_path: string; page_location: string } {
  const url = new URL(href);
  const page_path = url.pathname === '/estimate' || url.pathname.startsWith('/estimate/') ? '/estimate' : url.pathname;
  return { page_path, page_location: `${url.origin}${page_path}` };
}
