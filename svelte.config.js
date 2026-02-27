import adapter from "@sveltejs/adapter-cloudflare";

/** @type {import("@sveltejs/kit").Config} */
const config = {
  kit: {
    adapter: adapter({
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
          "/sitemap.xml",
        ],
      },
    }),
  }
};

export default config;
