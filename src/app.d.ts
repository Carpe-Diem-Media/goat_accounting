// Secret names for existing integrations. Values remain outside source control.
declare namespace Cloudflare {
	interface Env {
		DASHBOARD_RELEASE_ENABLED?: string;
		PRICING_ADMIN_RELEASE_ENABLED?: string;
		ESTIMATOR_ENABLED?: string;
		ESTIMATE_READ_ENABLED?: string;
		ESTIMATE_CONTACT_ENABLED?: string;
		CONTACT_RATE_LIMITER?: RateLimit;
		TURNSTILE_SITE_KEY?: string;
		TURNSTILE_SECRET_KEY?: string;
		TURNSTILE_HOSTNAME?: string;
		CALENDAR_ACCESS_TOKEN?: string;
		CALENDAR_API_KEY?: string;
		GOOGLE_CALENDAR_ACCESS_TOKEN?: string;
		RESEND_API_KEY?: string;
		ESTIMATE_NOTIFICATIONS_ENABLED?: string;
		ESTIMATE_EMAIL_CONTENT?: string;
		ESTIMATE_EMAIL_CONTENT_SHA256?: string;
		ESTIMATE_EMAIL_FROM?: string;
		ESTIMATE_EMAIL_INTERNAL_TO?: string;
		SUPABASE_URL?: string;
		SUPABASE_PUBLISHABLE_KEY?: string;
		SUPABASE_STAFF_AUTH_ENABLED?: string;
		GOAT_STAFF_SUPABASE_PROJECT_REF?: string;
		SUPABASE_SECRET_KEY?: string;
		SUPABASE_SERVICE_ROLE_KEY?: string;
	}
}

declare namespace App {
	interface Locals {
		dashboardEnabled: boolean;
		pricingAdminEnabled: boolean;
		supabase: import('$lib/server/supabase/session-client').StaffSessionClient | null;
	}

	interface Platform {
		env: Cloudflare.Env;
	}
}

// SvelteKit 3 retains this deprecated runtime module for existing application imports.
declare module '$app/environment' {
	export const browser: boolean;
	export const dev: boolean;
	export const building: boolean;
	export const version: string;
}
