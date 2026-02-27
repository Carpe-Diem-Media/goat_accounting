import { error } from '@sveltejs/kit';
import { getService, serviceList } from '$lib/data/services';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
  const service = getService(params.slug);
  if (!service) {
    error(404, { message: 'Service not found' });
  }
  return { service };
};

export const entries = () => {
  return serviceList.map((s) => ({ slug: s.slug }));
};

export const prerender = true;
