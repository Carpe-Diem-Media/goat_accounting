import adapter from "@sveltejs/adapter-cloudflare";
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const libPath = fileURLToPath(new URL('./src/lib', import.meta.url));

export default defineConfig({
	resolve: {
		alias: [{ find: /^\$lib(?=\/|$)/, replacement: libPath }]
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter({
				config: './wrangler.toml',
				platformProxy: {
					environment: 'preview',
					remoteBindings: false
				},
				routes: {
					include: ["/*"],
					exclude: [
						"<build>",
						"/images/*",
						"/fonts/*",
						"/favicon.svg",
						"/apple-touch-icon.svg",
						"/manifest.webmanifest",
						"/robots.txt",
						"/og-default.svg",
						"/sitemap.xml"
					]
				}
			})
		})
	]
});
