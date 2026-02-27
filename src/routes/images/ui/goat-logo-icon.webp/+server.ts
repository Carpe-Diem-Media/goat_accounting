import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => {
  return new Response(null, {
    status: 308,
    headers: {
      Location: '/images/ui/GOAT%20Logo%20Icon.webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
