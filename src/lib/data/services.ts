export interface ServicePriceRow {
  item: string;
  price: string;
}

export interface ServicePriceGroup {
  label: string;
  rows: ServicePriceRow[];
  note?: string;
}

export interface ProcessStep {
  title: string;
  description: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface ServiceData {
  slug: string;
  updated_at?: string;
  title: string;
  shortTitle: string;
  metaTitle: string;
  metaDescription: string;
  heroDescription: string;
  badge?: string;
  icon: 'gem' | 'scissors' | 'star' | 'sparkles' | 'users';
  included: string[];
  excluded: string[];
  process: ProcessStep[];
  audience: {
    description: string;
    items: string[];
  };
  pricing: ServicePriceGroup[];
  addOns?: ServicePriceRow[];
  faq: FAQ[];
  relatedSlugs: string[];
}

const data: Record<string, ServiceData> = {
  'bridal-makeup': {
    slug: 'bridal-makeup',
    updated_at: '2026-02-17',
    title: 'Bridal Makeup',
    shortTitle: 'Bridal Makeup',
    metaTitle: 'Bridal Makeup Artist Pretoria | Goat Accounting',
    metaDescription:
      'Professional bridal makeup artist in Pretoria, Gauteng. Includes trial session and premium lash application. Serving Centurion, Midrand, Sandton, and Johannesburg.',
    heroDescription:
      'Your wedding day deserves a flawless, lasting look. From the initial consultation through to the final touch on the morning of your wedding, every detail is carefully considered to create a look that is uniquely you.',
    badge: 'Most Popular',
    icon: 'gem',
    included: [
      'Pre-wedding consultation to discuss your vision, dress, and venue',
      'Full bridal trial session scheduled 2\u20134 weeks before the wedding',
      'Wedding day makeup application',
      'Premium lash application',
      'Long-wear, photo-ready finish designed for the South African climate',
      'Touch-up kit left with you for the rest of the day',
    ],
    excluded: [
      'Hair styling (available separately or as a combo package)',
      'Skincare products or facial treatments',
      'Travel beyond 30\u00A0km from Moreleta Park (travel fee applies)',
    ],
    process: [
      {
        title: 'Consultation',
        description:
          'We discuss your wedding theme, dress, venue lighting, personal style, and any inspiration photos. This can happen over WhatsApp, a phone call, or in person.',
      },
      {
        title: 'Trial Session',
        description:
          'A full makeup application 2\u20134 weeks before your wedding. We refine the look together until it is exactly right. Photographs are taken in both natural and flash lighting so you can see how everything translates.',
      },
      {
        title: 'Wedding Day',
        description:
          'I arrive at your venue on the morning of your wedding. Your bridal makeup is done last so it is freshest for photos and the ceremony. A personal touch-up kit is left with you for the reception.',
      },
    ],
    audience: {
      description:
        'This service is designed for brides who want a polished, long-lasting makeup look for their wedding day.',
      items: [
        'Brides getting married in Pretoria, Centurion, Midrand, Sandton, or wider Gauteng',
        'Brides who want a dedicated trial session before the big day',
        'Anyone who values a professional, photo-ready finish that lasts from morning to midnight',
      ],
    },
    pricing: [
      {
        label: 'Bridal',
        rows: [
          { item: 'Bridal Makeup (incl. trial & lashes)', price: 'R1,500' },
        ],
      },
      {
        label: 'Wedding Party',
        rows: [
          { item: 'Bridesmaid Makeup', price: 'R500' },
          { item: 'Mother of Bride / Groom', price: 'R400' },
        ],
      },
    ],
    addOns: [
      { item: 'Standalone Trial Session', price: 'R400' },
      { item: 'Lash Application', price: 'R50' },
      { item: 'Extra Person', price: 'R400' },
    ],
    faq: [
      {
        question: 'How far in advance should I book?',
        answer:
          'For weddings, I recommend booking 3\u20136 months ahead, especially during peak season (October\u2013March). Popular dates fill up quickly. A 50% deposit secures your date.',
      },
      {
        question: 'Do you travel to my venue?',
        answer:
          'Yes. I am based in Moreleta Park, Pretoria, and travel across Centurion, Midrand, Sandton, and Johannesburg. Travel is charged at R5 per kilometre (to the venue and back).',
      },
      {
        question: 'What makeup brands do you use?',
        answer:
          'I use a combination of professional, long-wear brands suited to your skin type and tone. Products are chosen specifically to last in the South African climate \u2014 from morning prep through to the last dance.',
      },
      {
        question: 'What if I don\u2019t like my trial look?',
        answer:
          'That is exactly what the trial is for. We adjust and refine until you are 100% happy. Most brides make small tweaks, and the final wedding-day application always reflects those preferences.',
      },
      {
        question: 'Is the trial session included in the bridal price?',
        answer:
          'Yes. The R1,500 bridal makeup price includes the trial session, the wedding-day application, and premium lash application. There is no separate charge for the trial.',
      },
      {
        question: 'Can you do my bridesmaids and mother as well?',
        answer:
          'Absolutely. Bridesmaid makeup is R500 per person and mother of the bride or groom is R400. For larger groups, consider the Wedding Package for the best value.',
      },
    ],
    relatedSlugs: ['bridal-hair', 'bridal-hair-and-makeup', 'wedding-packages'],
  },

  'bridal-hair': {
    slug: 'bridal-hair',
    updated_at: '2026-02-17',
    title: 'Bridal Hair Styling',
    shortTitle: 'Bridal Hair',
    metaTitle: 'Bridal Hair Stylist Pretoria | Goat Accounting',
    metaDescription:
      'Professional bridal hair styling in Pretoria, Gauteng. Blow waves, upstyles, and wedding party hair for bridesmaids, mothers, and grandmothers. Serving Centurion, Midrand, and Johannesburg.',
    heroDescription:
      'Elegant hair styling for your wedding day, from flowing blow waves to intricate upstyles. Pricing is based on hair length and style, so you know exactly what to expect.',
    icon: 'scissors',
    included: [
      'Pre-wedding consultation to discuss your hairstyle vision',
      'Professional styling on the wedding morning',
      'Heat protection and finishing products',
      'Secure pinning for upstyles that last all day and night',
      'Hairspray and setting to withstand the Gauteng climate',
    ],
    excluded: [
      'Makeup application (available separately or as a combo package)',
      'Hair extensions or hairpieces (bring your own and they will be styled in)',
      'Hair washing or blow-dry prep (arrive with clean, dry hair)',
    ],
    process: [
      {
        title: 'Consultation',
        description:
          'We discuss your dress neckline, veil or accessories, and the overall feel you want. Pinterest boards and reference photos are welcome. I\u2019ll advise on what works best with your hair length and texture.',
      },
      {
        title: 'Hair Preparation',
        description:
          'I\u2019ll guide you on how to prepare your hair in the days leading up to the wedding \u2014 when to wash, what products to use, and whether to arrive with straight or natural texture.',
      },
      {
        title: 'Wedding Day',
        description:
          'Your hair is styled at your venue on the morning of the wedding. For bridal parties, I work through each person in a planned order, with the bride styled last for the freshest finish.',
      },
    ],
    audience: {
      description:
        'For brides and wedding parties who want professional, lasting hair styling on the big day.',
      items: [
        'Brides wanting a blow wave, upstyle, or half-up-half-down look',
        'Bridal parties who want coordinated styling for everyone',
        'Mothers and grandmothers of the bride or groom',
      ],
    },
    pricing: [
      {
        label: 'Bridal Hair',
        rows: [
          { item: 'Blow wave (short hair)', price: 'R450' },
          { item: 'Blow wave (long hair)', price: 'R550' },
          { item: 'Upstyle (short hair)', price: 'R850' },
          { item: 'Upstyle (long hair)', price: 'R1,100' },
        ],
      },
      {
        label: 'Bridesmaid Hair',
        rows: [
          { item: 'Blow wave (short)', price: 'R350' },
          { item: 'Blow wave (long)', price: 'R450' },
          { item: 'Upstyle (short)', price: 'R650' },
          { item: 'Upstyle (long)', price: 'R850' },
        ],
      },
      {
        label: 'Mother of Bride / Groom',
        rows: [
          { item: 'Blow wave (short)', price: 'R350' },
          { item: 'Blow wave (long)', price: 'R450' },
          { item: 'Upstyle (short)', price: 'R650' },
          { item: 'Upstyle (long)', price: 'R850' },
        ],
      },
      {
        label: 'Grandmother',
        rows: [
          { item: 'Short hair', price: 'R300' },
          { item: 'Long hair', price: 'R400' },
        ],
      },
    ],
    faq: [
      {
        question: 'What\u2019s the difference between a blow wave and an upstyle?',
        answer:
          'A blow wave gives you loose, voluminous curls or waves that fall naturally. An upstyle is a structured up-do, such as a bun, chignon, or braided style that keeps hair off your neck and shoulders.',
      },
      {
        question: 'How do you determine short vs long hair pricing?',
        answer:
          'Short hair is generally shoulder-length or above. Long hair is below the shoulders. If you\u2019re unsure, send a photo during the consultation and I\u2019ll confirm.',
      },
      {
        question: 'Can you work with hair extensions?',
        answer:
          'Yes, bring your own clip-in or tape-in extensions and I will style them seamlessly with your natural hair. I don\u2019t supply extensions, but I\u2019m happy to recommend suppliers.',
      },
      {
        question: 'Should I wash my hair before the wedding?',
        answer:
          'I\u2019ll give you specific guidance based on your hair type during the consultation. In general, day-old hair holds styles better than freshly washed hair.',
      },
      {
        question: 'Do you offer a hair trial?',
        answer:
          'Hair trials can be arranged on request. For bridal makeup, the trial is included in the price. Hair trials are quoted separately \u2014 reach out and we\u2019ll discuss what makes sense for your wedding.',
      },
    ],
    relatedSlugs: ['bridal-makeup', 'bridal-hair-and-makeup', 'wedding-packages'],
  },

  'wedding-packages': {
    slug: 'wedding-packages',
    updated_at: '2026-02-17',
    title: 'Wedding Packages',
    shortTitle: 'Wedding Packages',
    metaTitle: 'Wedding Hair & Makeup Packages Pretoria | Goat Accounting',
    metaDescription:
      'Complete wedding hair and makeup packages in Pretoria. Bride plus bridal party packages from R2,650. Best value for full wedding day beauty across Gauteng.',
    heroDescription:
      'The best value for your wedding day. Packages include the bride and up to 3 additional people \u2014 bridesmaids, mothers, or anyone in your bridal party. Available as makeup-only, hair-only, or a full hair and makeup package.',
    badge: 'Best Value',
    icon: 'star',
    included: [
      'Bride\u2019s full service (makeup and/or hair depending on package)',
      'Service for 3 additional people (bridesmaid, mother, grandmother, etc.)',
      'Bridal trial session (included in makeup packages)',
      'On-location service at your venue or preparation location',
      'Coordinated morning timeline so everyone is ready on time',
    ],
    excluded: [
      'Travel beyond 30\u00A0km from Moreleta Park (travel fee of R5/km applies)',
      'Hair extensions or hairpieces (bring your own)',
      'Skincare or facial treatments',
    ],
    process: [
      {
        title: 'Package Consultation',
        description:
          'We discuss who is in your bridal party, what services each person needs (makeup, hair, or both), and plan the morning timeline. This ensures no one is rushed.',
      },
      {
        title: 'Bridal Trial',
        description:
          'Your makeup trial is scheduled 2\u20134 weeks before the wedding. This is included in every package that includes bridal makeup.',
      },
      {
        title: 'Wedding Morning',
        description:
          'I arrive at your venue early and work through the bridal party in a planned order. The bride is always done last for the freshest look. Everyone is ready with time to spare.',
      },
    ],
    audience: {
      description:
        'For bridal parties who want professional, coordinated beauty services at the best possible price.',
      items: [
        'Brides with a bridal party of 4 or more people',
        'Anyone wanting to bundle hair and makeup for savings',
        'Wedding planners coordinating beauty services for the full party',
      ],
    },
    pricing: [
      {
        label: 'Makeup Packages',
        rows: [
          { item: 'Wedding Package \u2014 Makeup (Bride + 3)', price: 'R4,000' },
          { item: 'Additional Person', price: 'R400' },
        ],
        note: 'Includes bridal makeup with trial and lashes, plus 3 additional people.',
      },
      {
        label: 'Hair Packages',
        rows: [
          { item: 'Wedding Package \u2014 Hair (Bride + 3)', price: 'R2,650' },
        ],
        note: 'Includes bridal hair styling plus 3 additional people. Style and length upgrades available.',
      },
      {
        label: 'Full Hair & Makeup',
        rows: [
          { item: 'Full Wedding Package (Bride + 3)', price: 'From R6,650' },
        ],
        note: 'Complete hair and makeup for the bride and 3 additional people. Best value for full bridal parties.',
      },
    ],
    faq: [
      {
        question: 'Who counts as the \u201c3 additional people\u201d?',
        answer:
          'Anyone you choose \u2014 bridesmaids, mother of the bride/groom, grandmother, maid of honour, flower girl (if age-appropriate). The package is flexible.',
      },
      {
        question: 'Can I add more than 3 extra people?',
        answer:
          'Yes. Additional people can be added at R400 per person for makeup and quoted individually for hair (based on style and length). Just let me know your full party count.',
      },
      {
        question: 'How long does the morning take for a full bridal party?',
        answer:
          'As a general guide, allow 45\u201360 minutes per person for makeup and 30\u201345 minutes for hair. For a party of 4 (bride + 3), plan for about 3\u20134 hours total. I\u2019ll provide a detailed timeline.',
      },
      {
        question: 'Do you do hair and makeup simultaneously?',
        answer:
          'For larger parties, I may bring an assistant or schedule hair and makeup in rotation so the morning flows smoothly. This is discussed during the consultation.',
      },
      {
        question: 'Is there a deposit to secure the package?',
        answer:
          'Yes. A 50% deposit secures your date. The remaining balance is due on the wedding day.',
      },
    ],
    relatedSlugs: ['bridal-makeup', 'bridal-hair', 'bridal-hair-and-makeup'],
  },

  'matric-farewell': {
    slug: 'matric-farewell',
    updated_at: '2026-02-17',
    title: 'Matric Farewell Makeup',
    shortTitle: 'Matric Farewell',
    metaTitle: 'Matric Farewell Makeup Pretoria | Goat Accounting',
    metaDescription:
      'Professional matric farewell makeup in Pretoria, Gauteng. Age-appropriate glam that lasts all night and photographs beautifully. Group bookings available for friend groups.',
    heroDescription:
      'Your matric farewell is a once-in-a-lifetime evening. You deserve a look that makes you feel confident, photographs beautifully, and lasts from the pre-drinks to the last dance. Age-appropriate glam that lets your personality shine through.',
    icon: 'sparkles',
    included: [
      'Style consultation to plan your look around your dress and accessories',
      'Full makeup application with age-appropriate product selection',
      'Lash application options available',
      'Long-wear setting designed to last the entire evening',
      'Photo-ready finish in both natural and flash lighting',
    ],
    excluded: [
      'Hair styling (available as an add-on \u2014 see pricing below)',
      'Skincare or facial treatments',
      'Travel beyond 30\u00A0km from Moreleta Park (travel fee applies)',
    ],
    process: [
      {
        title: 'Consultation',
        description:
          'We chat about your dress colour, accessories, and the vibe you\u2019re going for \u2014 soft and natural, full glam, or somewhere in between. Send photos of your dress and any makeup inspiration you love.',
      },
      {
        title: 'Farewell Day',
        description:
          'I arrive at your home or chosen location in the afternoon. Your makeup is applied with enough time for photos before you leave. Everything is set to last the entire evening without touch-ups.',
      },
    ],
    audience: {
      description:
        'For matric learners who want to look and feel their best on farewell night.',
      items: [
        'Matric learners in Pretoria, Centurion, Midrand, and surrounding areas',
        'Parents booking a professional makeup experience for their child',
        'Friend groups wanting to get ready together with a professional artist',
      ],
    },
    pricing: [
      {
        label: 'Farewell Makeup',
        rows: [{ item: 'Matric Farewell Makeup', price: 'R500' }],
      },
      {
        label: 'Add Hair Styling',
        rows: [
          { item: 'Blow wave (short hair)', price: 'R350' },
          { item: 'Blow wave (long hair)', price: 'R450' },
        ],
      },
    ],
    addOns: [{ item: 'Lash Application', price: 'R50' }],
    faq: [
      {
        question: 'How early should I book for my matric farewell?',
        answer:
          'Popular farewell dates fill up fast \u2014 especially September and October. I recommend booking at least 4\u20136 weeks in advance. A 50% deposit secures your slot.',
      },
      {
        question: 'Can my friends and I get ready together?',
        answer:
          'Absolutely! Group bookings are one of the best parts. I can do makeup for your whole group at one location. For groups of 3 or more, group discounts may apply \u2014 just ask.',
      },
      {
        question: 'Will the makeup be age-appropriate?',
        answer:
          'Always. I work with each person to find a look that enhances their natural features and suits their age. The goal is to look like the best version of yourself, not someone else.',
      },
      {
        question: 'How long does the application take?',
        answer:
          'About 45\u201360 minutes per person. For a group of 3 friends, plan for about 2.5\u20133 hours total. I\u2019ll give you a timeline once the booking is confirmed.',
      },
      {
        question: 'What should I do to prepare my skin?',
        answer:
          'Moisturise well in the days leading up. Avoid trying new skincare products the week before. Come with a clean, moisturised face \u2014 no foundation or base products.',
      },
      {
        question: 'Do you travel to my location?',
        answer:
          'Yes. I\u2019m based in Moreleta Park, Pretoria, and travel across Centurion, Midrand, and surrounding areas. Travel is charged at R5 per kilometre (to your location and back).',
      },
    ],
    relatedSlugs: ['special-events', 'bridal-makeup'],
  },

  'special-events': {
    slug: 'special-events',
    updated_at: '2026-02-17',
    title: 'Special Event Makeup',
    shortTitle: 'Special Events',
    metaTitle: 'Event Makeup Artist Pretoria | Goat Accounting',
    metaDescription:
      'Professional event makeup artist in Pretoria, Gauteng. Makeup for birthdays, engagements, photo shoots, and corporate events. On-location service across Centurion, Midrand, and Johannesburg.',
    heroDescription:
      'Whether it\u2019s a milestone birthday, engagement celebration, professional photo shoot, or corporate event \u2014 you deserve to look and feel exceptional. Professional makeup that photographs beautifully and lasts all night.',
    icon: 'sparkles',
    included: [
      'Personalised look consultation tailored to your event and outfit',
      'Full glam or soft natural finish \u2014 your choice',
      'Long-wear application designed to last your entire event',
      'Photo-ready finish for both natural and flash lighting',
    ],
    excluded: [
      'Hair styling (available as an add-on \u2014 see pricing below)',
      'Skincare or facial treatments',
      'Travel beyond 30\u00A0km from Moreleta Park (travel fee applies)',
    ],
    process: [
      {
        title: 'Consultation',
        description:
          'We discuss the event, your outfit, and the look you\u2019re going for. Whether you want bold glam or a polished natural glow, I\u2019ll tailor everything to suit the occasion.',
      },
      {
        title: 'Application',
        description:
          'I arrive at your home or chosen location with everything needed. Your makeup is applied and set to last the duration of your event. The session takes approximately 45\u201360 minutes.',
      },
    ],
    audience: {
      description:
        'For anyone who wants professional makeup for a special occasion.',
      items: [
        'Birthday celebrations and milestone events',
        'Engagement parties and anniversary dinners',
        'Professional photo shoots and personal branding sessions',
        'Corporate events, galas, and formal functions',
      ],
    },
    pricing: [
      {
        label: 'Event Makeup',
        rows: [{ item: 'Special Event Makeup', price: 'R500' }],
      },
      {
        label: 'Add Hair Styling',
        rows: [
          { item: 'Blow wave (short hair)', price: 'R350' },
          { item: 'Blow wave (long hair)', price: 'R450' },
        ],
      },
    ],
    addOns: [
      { item: 'Lash Application', price: 'R50' },
      { item: 'Extra Person', price: 'R400' },
    ],
    faq: [
      {
        question: 'What occasions do you cater for?',
        answer:
          'Birthdays, engagement parties, anniversaries, baby showers, photo shoots, corporate events, galas, and any occasion where you want to look your best. If you\u2019re celebrating something, I\u2019m here for it.',
      },
      {
        question: 'Can you do makeup for a group?',
        answer:
          'Yes. Extra people can be added at R400 per person. For groups of 3 or more, group discounts may apply. Let me know your group size when you enquire.',
      },
      {
        question: 'How long does the makeup last?',
        answer:
          'All applications use long-wear, professional products and setting techniques. You can expect your makeup to last 8\u201312 hours without needing a touch-up.',
      },
      {
        question: 'Do you do on-location makeup?',
        answer:
          'Yes. I bring everything to your home, hotel, or event venue. Based in Moreleta Park, Pretoria, with travel across Centurion, Midrand, Sandton, and Johannesburg at R5 per kilometre.',
      },
    ],
    relatedSlugs: ['matric-farewell', 'bridal-makeup'],
  },

  'bridal-hair-and-makeup': {
    slug: 'bridal-hair-and-makeup',
    updated_at: '2026-02-17',
    title: 'Bridal Hair & Makeup',
    shortTitle: 'Hair & Makeup',
    metaTitle: 'Bridal Hair & Makeup Pretoria | Goat Accounting',
    metaDescription:
      'Complete bridal hair and makeup service in Pretoria, Gauteng. One artist for your entire wedding morning. Packages from R1,950 for the bride, with bridal party rates available.',
    heroDescription:
      'One artist, one seamless experience. Get both your hair and makeup done for your wedding day without coordinating multiple people. Everything is planned together for a cohesive look that flows from hair to makeup.',
    badge: 'Most Popular',
    icon: 'gem',
    included: [
      'Pre-wedding consultation covering both hair and makeup',
      'Bridal makeup trial session (2\u20134 weeks before the wedding)',
      'Wedding day makeup application with premium lashes',
      'Wedding day hair styling (blow wave or upstyle)',
      'Coordinated morning timeline',
      'Touch-up kit for the rest of the day',
    ],
    excluded: [
      'Hair extensions or hairpieces (bring your own and they\u2019ll be styled in)',
      'Skincare or facial treatments',
      'Travel beyond 30\u00A0km from Moreleta Park (travel fee of R5/km applies)',
    ],
    process: [
      {
        title: 'Consultation',
        description:
          'We plan both your hair and makeup together \u2014 your dress neckline, veil, accessories, and the overall look you want. Having one person handle both means everything works together.',
      },
      {
        title: 'Makeup Trial',
        description:
          'Your full makeup trial is done 2\u20134 weeks before the wedding. We finalize the look and discuss any adjustments. This is also a good time to confirm your hair styling preferences.',
      },
      {
        title: 'Wedding Morning',
        description:
          'I arrive early and start with hair, then move to makeup. For bridal parties, everyone is worked through in a planned order. The bride is always finished last for the freshest result.',
      },
    ],
    audience: {
      description:
        'For brides who want the convenience of one artist handling both hair and makeup on the wedding morning.',
      items: [
        'Brides who prefer a single point of contact for all beauty services',
        'Brides who want their hair and makeup to work together as a cohesive look',
        'Smaller weddings where one artist can comfortably handle the full party',
      ],
    },
    pricing: [
      {
        label: 'Bridal',
        rows: [
          { item: 'Bridal Hair & Makeup', price: 'From R1,950' },
        ],
        note: 'Includes bridal makeup (with trial & lashes) plus hair styling. Final price depends on hair length and style choice.',
      },
      {
        label: 'Wedding Party',
        rows: [
          { item: 'Bridesmaid Hair & Makeup', price: 'From R850' },
          { item: 'Mother Hair & Makeup', price: 'From R750' },
        ],
        note: 'Final price depends on hair length and style choice.',
      },
      {
        label: 'Full Wedding Package',
        rows: [
          { item: 'Full Package (Bride + 3)', price: 'From R6,650' },
        ],
        note: 'Complete hair and makeup for the bride and 3 additional people. Best value for full bridal parties.',
      },
    ],
    faq: [
      {
        question: 'Is it better to book one person for both hair and makeup?',
        answer:
          'For smaller bridal parties (up to 4\u20135 people), having one artist handle both is efficient and ensures a perfectly coordinated look. For larger parties, we may discuss bringing an assistant.',
      },
      {
        question: 'Do you do hair or makeup first?',
        answer:
          'Hair is generally done first, then makeup. This ensures the makeup is at its freshest for photos and the ceremony. For bridal parties, I alternate between hair and makeup across the group.',
      },
      {
        question: 'What does \u201cFrom R1,950\u201d mean?',
        answer:
          'The starting price includes bridal makeup (with trial and lashes) plus the most affordable hair option (blow wave on short hair at R450). The final price depends on your chosen hair style and length.',
      },
      {
        question: 'How long does the full service take?',
        answer:
          'For the bride alone, allow about 1.5\u20132 hours for both hair and makeup. For a full bridal party of 4, plan for 4\u20135 hours total. I\u2019ll provide a detailed timeline during the consultation.',
      },
      {
        question: 'Can I book just makeup or just hair instead?',
        answer:
          'Of course. Individual bridal makeup and bridal hair services are available separately. Check the Bridal Makeup and Bridal Hair pages for standalone pricing.',
      },
    ],
    relatedSlugs: ['bridal-makeup', 'bridal-hair', 'wedding-packages'],
  },
};

export const services = data;
export const serviceList = Object.values(data);

export function getService(slug: string): ServiceData | undefined {
  return data[slug];
}
