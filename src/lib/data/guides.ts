export type GuideCategory = 'Skin Prep' | 'Bridal' | 'Matric' | 'Events';

export interface GuideData {
  slug: string;
  title: string;
  description: string;
  category: GuideCategory;
  updated_at: string; // YYYY-MM-DD
  hero_image: string;
  read_time_minutes: number;
  featured?: boolean;
}

const data: Record<string, GuideData> = {
  'skin-prep-before-makeup': {
    slug: 'skin-prep-before-makeup',
    title: 'Essential Skin Prep Checklist for Flawless Makeup',
    description:
      'Perfect makeup starts with calm, hydrated, and smooth skin. Use this checklist to prep for your wedding, matric farewell, or special event in Pretoria.',
    category: 'Skin Prep',
    updated_at: '2026-02-23',
    hero_image: '/images/guides/skin-prep-before-makeup.jpg',
    read_time_minutes: 10,
    featured: true,
  },
};

export const guides = data;

/**
 * Curated list of guides (manual order).
 */
export const guideList: GuideData[] = [
  data['skin-prep-before-makeup'],
];

/**
 * Helper to get the guide URL.
 */
export function getGuideUrl(slug: string) {
  return `/makeup-guides/${slug}`;
}
