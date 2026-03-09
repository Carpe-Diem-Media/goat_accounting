export const INSTAGRAM_URL = 'https://www.instagram.com/goat.accounting/';
export const WHATSAPP_PHONE_E164 = '27828198890';
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_PHONE_E164}`;

export function build_whatsapp_url(message: string) {
  return `${WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
}
