import { parseArgs } from "util";

const { values } = parseArgs({
  options: {
    base: {
      type: "string",
      short: "b",
      default: "http://localhost:5173",
    },
  },
});

const BASE_URL = values.base.endsWith("/") ? values.base.slice(0, -1) : values.base;

const paths = [
  "/makeup-guides",
  "/makeup-guides/skin-prep-before-makeup",
];

async function checkPath(path) {
  const url = `${BASE_URL}${path}`;
  console.log(`Checking ${url}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  [FAIL] HTTP ${response.status}`);
      return false;
    }

    const html = await response.text();
    
    // Simple regex counting
    const ogSiteNameCount = (html.match(/property="og:site_name"/g) || []).length;
    const ogLocaleCount = (html.match(/property="og:locale"/g) || []).length;
    const canonicalCount = (html.match(/link rel="canonical"/g) || []).length;

    console.log(`  og:site_name: ${ogSiteNameCount}`);
    console.log(`  og:locale:    ${ogLocaleCount}`);
    console.log(`  canonical:    ${canonicalCount}`);

    let pass = true;
    if (ogSiteNameCount !== 1) {
      console.error(`  [FAIL] og:site_name should be 1, found ${ogSiteNameCount}`);
      pass = false;
    }
    if (ogLocaleCount !== 1) {
      console.error(`  [FAIL] og:locale should be 1, found ${ogLocaleCount}`);
      pass = false;
    }
    if (canonicalCount !== 1) {
      console.error(`  [FAIL] canonical should be 1, found ${canonicalCount}`);
      pass = false;
    }

    if (pass) {
      console.log("  [PASS]");
    }
    return pass;
  } catch (e) {
    console.error(`  [FAIL] Fetch error: ${e.message}`);
    return false;
  }
}

async function run() {
  let allPass = true;
  for (const path of paths) {
    const success = await checkPath(path);
    if (!success) allPass = false;
    console.log("");
  }

  if (!allPass) {
    process.exit(1);
  }
}

run();
