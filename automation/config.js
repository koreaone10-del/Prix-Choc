import "dotenv/config";

const ROOT_DIR = new URL("../", import.meta.url).pathname;

const toNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value).toLowerCase() === "true";
};

export const config = {
  sawa9ly: {
    baseUrl:
      process.env.SAWA9LY_BASE_URL ||
      "https://affiliate.sawa9ly.pro",
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
    scrapeLimit: toNumber(process.env.SCRAPE_LIMIT, 2094),
    scrapeConcurrency: toNumber(
      process.env.SCRAPE_CONCURRENCY,
      8
    ),
    concurrency: toNumber(
      process.env.SCRAPE_CONCURRENCY,
      8
    ),
    headless: toBoolean(process.env.HEADLESS, true),
    dryRun: toBoolean(process.env.DRY_RUN, false),

    missingConfirmationRuns: toNumber(
      process.env.MISSING_CONFIRMATION_RUNS,
      2
    ),

    minimumCoveragePercent: toNumber(
      process.env.MINIMUM_COVERAGE_PERCENT,
      70
    ),

    maxDiscoveryPages: toNumber(
      process.env.MAX_DISCOVERY_PAGES,
      250
    ),

    pageTimeoutMs: toNumber(
      process.env.PAGE_TIMEOUT_MS,
      30000
    ),

    navigationTimeoutMs: toNumber(
      process.env.NAVIGATION_TIMEOUT_MS,
      30000
    ),

    navigationTimeout: toNumber(
      process.env.NAVIGATION_TIMEOUT_MS,
      30000
    ),

    renderWaitMs: toNumber(
      process.env.RENDER_WAIT_MS,
      1200
    ),

    pageDelay: toNumber(
      process.env.PAGE_DELAY_MS,
      1200
    ),

    loginWait: toNumber(
      process.env.LOGIN_WAIT_MS,
      5000
    ),
  },

  pricing: {
    defaultMargin: toNumber(
      process.env.DEFAULT_MARGIN,
      500
    ),

    minMargin: toNumber(
      process.env.MIN_MARGIN,
      300
    ),

    maxMargin: toNumber(
      process.env.MAX_MARGIN,
      2500
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
      width: toNumber(
        process.env.VIEWPORT_WIDTH,
        1280
      ),
      height: toNumber(
        process.env.VIEWPORT_HEIGHT,
        900
      ),
    },
  },

  safety: {
    requireNonEmptySource: true,

    keepUnavailableProducts: true,

    protectedFiles: [
      "index.html",
      "database.js",
      "locations.js",
    ],

    atomicWrite: true,
    createBackup: true,
  },
};

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
    !Number.isFinite(config.automation.scrapeConcurrency) ||
    config.automation.scrapeConcurrency < 1
  ) {
    errors.push(
      "SCRAPE_CONCURRENCY must be a positive number."
    );
  }

  if (
    !Number.isFinite(config.automation.concurrency) ||
    config.automation.concurrency < 1
  ) {
    errors.push("Concurrency must be a positive number.");
  }

  if (
    !Number.isFinite(
      config.automation.missingConfirmationRuns
    ) ||
    config.automation.missingConfirmationRuns < 1
  ) {
    errors.push(
      "MISSING_CONFIRMATION_RUNS must be at least 1."
    );
  }

  if (
    !Number.isFinite(
      config.automation.minimumCoveragePercent
    ) ||
    config.automation.minimumCoveragePercent <= 0 ||
    config.automation.minimumCoveragePercent > 100
  ) {
    errors.push(
      "MINIMUM_COVERAGE_PERCENT must be between 1 and 100."
    );
  }

  if (
    !Number.isFinite(
      config.automation.maxDiscoveryPages
    ) ||
    config.automation.maxDiscoveryPages < 1
  ) {
    errors.push(
      "MAX_DISCOVERY_PAGES must be at least 1."
    );
  }

  if (
    !Number.isFinite(config.automation.pageTimeoutMs) ||
    config.automation.pageTimeoutMs < 1000
  ) {
    errors.push(
      "PAGE_TIMEOUT_MS must be at least 1000 milliseconds."
    );
  }

  if (
    !Number.isFinite(
      config.automation.navigationTimeoutMs
    ) ||
    config.automation.navigationTimeoutMs < 1000
  ) {
    errors.push(
      "NAVIGATION_TIMEOUT_MS must be at least 1000 milliseconds."
    );
  }

  if (
    !Number.isFinite(config.automation.renderWaitMs) ||
    config.automation.renderWaitMs < 0
  ) {
    errors.push(
      "RENDER_WAIT_MS cannot be negative."
    );
  }

  if (
    !Number.isFinite(config.automation.pageDelay) ||
    config.automation.pageDelay < 0
  ) {
    errors.push(
      "PAGE_DELAY_MS cannot be negative."
    );
  }

  if (
    !Number.isFinite(config.automation.loginWait) ||
    config.automation.loginWait < 0
  ) {
    errors.push(
      "LOGIN_WAIT_MS cannot be negative."
    );
  }

  if (!Number.isFinite(config.pricing.defaultMargin)) {
    errors.push(
      "DEFAULT_MARGIN must be a valid number."
    );
  }

  if (
    !Number.isFinite(config.pricing.minMargin) ||
    !Number.isFinite(config.pricing.maxMargin) ||
    config.pricing.minMargin < 0 ||
    config.pricing.maxMargin < config.pricing.minMargin
  ) {
    errors.push(
      "Invalid pricing margin configuration."
    );
  }

  if (errors.length > 0) {
    throw new Error(
      "Configuration validation failed:\n- " +
      errors.join("\n- ")
    );
  }

  return true;
}

export function printConfigSummary() {
  console.log(
    "\n=== Prix-Choc Automation Configuration ==="
  );

  console.log("Sawa9ly:");
  console.log(
    "  Base URL:       " + config.sawa9ly.baseUrl
  );
  console.log(
    "  Login URL:      " + config.sawa9ly.loginUrl
  );
  console.log(
    "  Dashboard URL:  " + config.sawa9ly.dashboardUrl
  );
  console.log(
    "  Email:          " +
      (config.sawa9ly.email
        ? "configured"
        : "MISSING")
  );
  console.log(
    "  Password:       " +
      (config.sawa9ly.password
        ? "configured"
        : "MISSING")
  );

  console.log("\nAutomation:");
  console.log(
    "  Scrape limit:   " +
      config.automation.scrapeLimit
  );
  console.log(
    "  Concurrency:    " +
      config.automation.scrapeConcurrency
  );
  console.log(
    "  Headless:       " +
      config.automation.headless
  );
  console.log(
    "  Dry run:        " +
      config.automation.dryRun
  );
  console.log(
    "  Missing runs:   " +
      config.automation.missingConfirmationRuns
  );
  console.log(
    "  Min coverage:   " +
      config.automation.minimumCoveragePercent +
      "%"
  );
  console.log(
    "  Max pages:      " +
      config.automation.maxDiscoveryPages
  );
  console.log(
    "  Page timeout:   " +
      config.automation.pageTimeoutMs +
      " ms"
  );
  console.log(
    "  Navigation:     " +
      config.automation.navigationTimeoutMs +
      " ms"
  );
  console.log(
    "  Render wait:    " +
      config.automation.renderWaitMs +
      " ms"
  );
  console.log(
    "  Page delay:     " +
      config.automation.pageDelay +
      " ms"
  );
  console.log(
    "  Login wait:     " +
      config.automation.loginWait +
      " ms"
  );

  console.log("\nPricing:");
  console.log(
    "  Default margin: " +
      config.pricing.defaultMargin +
      " DA"
  );
  console.log(
    "  Min margin:     " +
      config.pricing.minMargin +
      " DA"
  );
  console.log(
    "  Max margin:     " +
      config.pricing.maxMargin +
      " DA"
  );

  console.log("\nPaths:");
  console.log(
    "  Products: " +
      config.paths.productsFile
  );
  console.log(
    "  Output:   " +
      config.paths.outputDir
  );
  console.log(
    "  Debug:    " +
      config.paths.debugDir
  );
  console.log(
    "  State:    " +
      config.paths.stateDir
  );
  console.log(
    "  History:  " +
      config.paths.historyDir
  );
  console.log(
    "  Backups:  " +
      config.paths.backupDir
  );

  console.log("\nProtected files:");
  for (const file of config.safety.protectedFiles) {
    console.log("  - " + file);
  }

  console.log(
    "===========================================\n"
  );
}

export default config;
