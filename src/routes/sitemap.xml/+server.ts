import { serviceList } from '$lib/data/services';
import { guideList } from '$lib/data/guides';
import type { RequestHandler } from './$types';

export const prerender = true;
const SITE_LASTMOD = '2026-02-27';

const toDateOnly = (value?: string) => {
  if (!value) {
    return SITE_LASTMOD;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return SITE_LASTMOD;
  }

  return parsed.toISOString().slice(0, 10);
};

export const GET: RequestHandler = () => {
  const baseUrl = 'https://goataccounting.com';

  const staticPages = [
    { path: '/', changefreq: 'weekly', priority: '1.0', lastmod: SITE_LASTMOD },
    { path: '/about', changefreq: 'monthly', priority: '0.8', lastmod: SITE_LASTMOD },
    { path: '/services', changefreq: 'monthly', priority: '0.9', lastmod: SITE_LASTMOD },
    { path: '/booking', changefreq: 'weekly', priority: '0.9', lastmod: SITE_LASTMOD },
    { path: '/makeup-guides', changefreq: 'monthly', priority: '0.9', lastmod: SITE_LASTMOD },
    { path: '/contact', changefreq: 'monthly', priority: '0.8', lastmod: SITE_LASTMOD },
  ];

  const servicePages = serviceList.map((s) => ({
    path: `/services/${s.slug}`,
    changefreq: 'monthly',
    priority: '0.8',
    lastmod: toDateOnly(s.updated_at),
  }));

  const guidePages = guideList.map((g) => ({
    path: `/makeup-guides/${g.slug}`,
    changefreq: 'monthly',
    priority: '0.8',
    lastmod: toDateOnly(g.updated_at),
  }));

  const allPages = [...staticPages, ...servicePages, ...guidePages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.path}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'max-age=3600',
    },
  });
};
