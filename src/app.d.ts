// Secret names for existing integrations. Values remain outside source control.
declare namespace Cloudflare {
	interface Env {
		CALENDAR_ACCESS_TOKEN?: string;
		CALENDAR_API_KEY?: string;
		GOOGLE_CALENDAR_ACCESS_TOKEN?: string;
		RESEND_API_KEY?: string;
		SUPABASE_SERVICE_ROLE_KEY?: string;
	}
}

// SvelteKit 3 retains this deprecated runtime module for existing application imports.
declare module '$app/environment' {
	export const browser: boolean;
	export const dev: boolean;
	export const building: boolean;
	export const version: string;
}
