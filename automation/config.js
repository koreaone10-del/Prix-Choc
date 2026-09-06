import "dotenv/config";

const ROOT_DIR = new URL("../", import.meta.url).pathname;

export const config = {
  sawa9ly: {
    baseUrl: process.env.SAWA9LY_BASE_URL || "https://affiliate.sawa9ly.pro",
    loginUrl:
      process.env.SAWA9LY_LOGIN_URL ||
      "https://affiliate.sawa9ly.pro/login",
    dashboardUrl:
      process.env.SAWA9LY_DASHBOARD_URL ||
      "https://affiliate.sawa9ly.pro/store",

    email: process.env.SAWA9LY_EMAIL || "",
    password: process.env.SAWA9LY_PASSWORD || "",
  },

  automation: {
    // Maximum number of products to discover/scrape in one run.
    // This is deliberately high enough for the current catalogue.
    scrapeLimit: Number(process.env.SCRAPE_LIMIT || 2094),

    concurrency: Number(process.env.SCRAPE_CONCURRENCY || 8),

    headless:
      String(process.env.HEADLESS ?? "true").toLowerCase() !== "false",

    dryRun:
      String(process.env.DRY_RUN ?? "false").toLowerCase() === "true",

    // A product must be confirmed missing on this number of
    // consecutive discovery runs before being marked unavailable.
    missingConfirmationRuns: Number(
      process.env.MISSING_CONFIRMATION_RUNS || 2
    ),

    // Safety threshold: prevents an abnormal scraper result
    // from replacing the catalogue with an incomplete dataset.
    minimumCoveragePercent: Number(
      process.env.MINIMUM_COVERAGE_PERCENT || 70
    ),

    // Maximum number of pages the discovery process may inspect.
    maxDiscoveryPages: Number(
      process.env.MAX_DISCOVERY_PAGES || 250
    ),

    // Timeouts.
    pageTimeoutMs: Number(
      process.env.PAGE_TIMEOUT_MS || 30000
    ),

    navigationTimeoutMs: Number(
      process.env.NAVIGATION_TIMEOUT_MS || 30000
    ),

    // Wait time after navigation / dynamic rendering.
    renderWaitMs: Number(
      process.env.RENDER_WAIT_MS || 1200
    ),
  },

  pricing: {
    // Default selling-price margin.
    defaultMargin: Number(
      process.env.DEFAULT_MARGIN || 1000
    ),

    // Minimum allowed margin.
    minMargin: Number(
      process.env.MIN_MARGIN || 300
    ),

    // Maximum allowed margin.
    maxMargin: Number(
      process.env.MAX_MARGIN || 5000
    ),
  },

  paths: {
    rootDir: ROOT_DIR,

    productsFile:
      process.env.PRODUCTS_FILE ||
      new URL("../products.js", import.meta.url).pathname,

    outputDir:
      process.env.OUTPUT_DIR ||
      new URL("./output", import.meta.url).pathname,

    debugDir:
      process.env.DEBUG_DIR ||
      new URL("./debug", import.meta.url).pathname,

    stateDir:
      process.env.STATE_DIR ||
      new URL("./state", import.meta.url).pathname,

    historyDir:
      process.env.HISTORY_DIR ||
      new URL("./state/history", import.meta.url).pathname,

    backupDir:
      process.env.BACKUP_DIR ||
      new URL("./backups", import.meta.url).pathname,
  },

  browser: {
    userAgent:
      process.env.USER_AGENT ||
      "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",

    viewport: {
      width: Number(process.env.VIEWPORT_WIDTH || 1280),
      height: Number(process.env.VIEWPORT_HEIGHT || 900),
    },
  },

  safety: {
    // Never allow a completely empty source to destroy the catalogue.
    requireNonEmptySource: true,

    // Never delete unavailable products from products.js.
    keepUnavailableProducts: true,

    // Never modify the original frontend/database files.
    protectedFiles: [
      "index.html",
      "database.js",
      "locations.js",
    ],

    // Atomic writes are mandatory for generated products.js.
    atomicWrite: true,

    // Create a backup before replacing products.js.
    createBackup: true,
  },
};

/**
 * Validate the automation configuration before starting.
 */
export function validateConfig() {
  const errors = [];

  if (!config.sawa9ly.baseUrl) {
    errors.push("SAWA9LY base URL is missing.");
  }

  if (!config.sawa9ly.loginUrl) {
    errors.push("SAWA9LY login URL is missing.");
  }

  if (!config.sawa9ly.dashboardUrl) {
    errors.push("SAWA9LY dashboard URL is missing.");
  }

  if (!config.sawa9ly.email) {
    errors.push(
      "SAWA9LY_EMAIL is missing. Add it to GitHub Actions Secrets."
    );
  }

  if (!config.sawa9ly.password) {
    errors.push(
      "SAWA9LY_PASSWORD is missing. Add it to GitHub Actions Secrets."
    );
  }

  if (
    !Number.isFinite(config.automation.scrapeLimit) ||
    config.automation.scrapeLimit < 1
  ) {
    errors.push("SCRAPE_LIMIT must be a positive number.");
  }

  if (
    !Number.isFinite(config.automation.concurrency) ||
    config.automation.concurrency < 1
  ) {
    errors.push("SCRAPE_CONCURRENCY must be a positive number.");
  }

  if (
    !Number.isFinite(config.automation.missingConfirmationRuns) ||
    config.automation.missingConfirmationRuns < 1
  ) {
    errors.push(
      "MISSING_CONFIRMATION_RUNS must be at least 1."
    );
  }

  if (
    !Number.isFinite(config.automation.minimumCoveragePercent) ||
    config.automation.minimumCoveragePercent <= 0 ||
    config.automation.minimumCoveragePercent > 100
  ) {
    errors.push(
      "MINIMUM_COVERAGE_PERCENT must be between 1 and 100."
    );
  }

  if (
    !Number.isFinite(config.pricing.minMargin) ||
    !Number.isFinite(config.pricing.maxMargin) ||
    config.pricing.minMargin < 0 ||
    config.pricing.maxMargin < config.pricing.minMargin
  ) {
    errors.push("Invalid pricing margin configuration.");
  }

  if (errors.length > 0) {
    throw new Error(
      "Configuration validation failed:\n- " +
        errors.join("\n- ")
    );
  }

  return true;
}

/**
 * Display a safe configuration summary.
 * Passwords are intentionally never printed.
 */
export function printConfigSummary() {
  console.log("\n=== Prix-Choc Automation Configuration ===");

  console.log("Sawa9ly:");
  console.log(`  Base URL:      ${config.sawa9ly.baseUrl}`);
  console.log(`  Login URL:     ${config.sawa9ly.loginUrl}`);
  console.log(`  Dashboard URL: ${config.sawa9ly.dashboardUrl}`);
  console.log(
    `  Email:         ${
      config.sawa9ly.email ? "configured" : "MISSING"
    }`
  );
  console.log(
    `  Password:      ${
      config.sawa9ly.password ? "configured" : "MISSING"
    }`
  );

  console.log("\nAutomation:");
  console.log(
    `  Scrape limit:  ${config.automation.scrapeLimit}`
  );
  console.log(
    `  Concurrency:   ${config.automation.concurrency}`
  );
  console.log(
    `  Headless:      ${config.automation.headless}`
  );
  console.log(
    `  Dry run:       ${config.automation.dryRun}`
  );
  console.log(
    `  Missing runs:  ${config.automation.missingConfirmationRuns}`
  );
  console.log(
    `  Min coverage:  ${config.automation.minimumCoveragePercent}%`
  );

  console.log("\nPricing:");
  console.log(
    `  Default margin: ${config.pricing.defaultMargin} DA`
  );
  console.log(
    `  Min margin:     ${config.pricing.minMargin} DA`
  );
  console.log(
    `  Max margin:     ${config.pricing.maxMargin} DA`
  );

  console.log("\nPaths:");
  console.log(`  Products: ${config.paths.productsFile}`);
  console.log(`  Output:   ${config.paths.outputDir}`);
  console.log(`  Debug:    ${config.paths.debugDir}`);
  console.log(`  State:    ${config.paths.stateDir}`);
  console.log(`  History:  ${config.paths.historyDir}`);
  console.log(`  Backups:  ${config.paths.backupDir}`);

  console.log("===========================================\n");
}

export default config;
