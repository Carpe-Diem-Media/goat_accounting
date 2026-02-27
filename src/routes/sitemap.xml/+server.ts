import type { RequestHandler } from './$types';

export const prerender = true;
const SITE_LASTMOD = new Date().toISOString().slice(0, 10);

export const GET: RequestHandler = () => {
  const baseUrl = 'https://goataccounting.co.za';

  const pages = [
    { path: '/', changefreq: 'weekly', priority: '1.0', lastmod: SITE_LASTMOD },
    { path: '/about', changefreq: 'monthly', priority: '0.8', lastmod: SITE_LASTMOD },
    { path: '/services', changefreq: 'monthly', priority: '0.9', lastmod: SITE_LASTMOD },
    { path: '/booking', changefreq: 'weekly', priority: '0.9', lastmod: SITE_LASTMOD },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
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
