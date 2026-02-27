export const SITE_URL = 'https://goataccounting.co.za';

export function abs_url(path: string) {
  const basePath = path.startsWith('/') ? path : `/${path}`;
  if (basePath === '/') {
    return SITE_URL;
  }

  return `${SITE_URL}${basePath.replace(/\/+$/, '')}`;
}
