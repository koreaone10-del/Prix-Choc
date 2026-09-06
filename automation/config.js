import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, "..");

const envNumber = (name, fallback) => {
  const value = Number(process.env[name]);

  return Number.isFinite(value)
    ? value
    : fallback;
};

const envBoolean = (name, fallback) => {
  if (process.env[name] === undefined) {
    return fallback;
  }

  return (
    String(process.env[name]).toLowerCase() === "true"
  );
};

const scrapeConcurrency = envNumber(
  "SCRAPE_CONCURRENCY",
  8
);

const navigationTimeoutMs = envNumber(
  "NAVIGATION_TIMEOUT_MS",
  30000
);

const pageTimeoutMs = envNumber(
  "PAGE_TIMEOUT_MS",
  30000
);

const renderWaitMs = envNumber(
  "RENDER_WAIT_MS",
  1200
);

const pageDelay = envNumber(
  "PAGE_DELAY_MS",
  1800
);

const loginWait = envNumber(
  "LOGIN_WAIT_MS",
  5000
);

const minimumCoveragePercent = envNumber(
  "MINIMUM_COVERAGE_PERCENT",
  70
);


/* =========================================================
   PRIX-CHOC AUTOMATION CONFIGURATION
   ========================================================= */

export const config = {
  /* =======================================================
     SAWA9LY
     ======================================================= */

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

    email:
      process.env.SAWA9LY_EMAIL || "",

    password:
      process.env.SAWA9LY_PASSWORD || ""
  },


  /* =======================================================
     AUTOMATION
     ======================================================= */

  automation: {
    /*
     * الحد الأقصى للمنتجات التي يتم Scrape لها
     * في كل تشغيل.
     *
     * 2094 يغطي الكتالوج الحالي.
     */

    scrapeLimit: envNumber(
      "SCRAPE_LIMIT",
      2094
    ),

    /*
     * الاسم الأساسي المستخدم في Workflow.
     */

    concurrency:
      scrapeConcurrency,

    /*
     * الاسم الذي يستخدمه scraper.js.
     *
     * نحافظ على الاسمين حتى لا يحدث
     * عدم توافق بين الملفات.
     */

    scrapeConcurrency:
      scrapeConcurrency,

    /*
     * تشغيل Playwright بدون واجهة.
     */

    headless:
      envBoolean(
        "HEADLESS",
        true
      ),

    /*
     * وضع الاختبار.
     */

    dryRun:
      envBoolean(
        "DRY_RUN",
        false
      ),

    /*
     * عدد عمليات Discovery المتتالية
     * المطلوبة قبل اعتبار المنتج مختفيًا.
     */

    missingConfirmationRuns:
      envNumber(
        "MISSING_CONFIRMATION_RUNS",
        2
      ),

    /*
     * أقل نسبة نجاح مسموحة للـScraper.
     *
     * 70 = 70%.
     */

    minimumCoveragePercent:
      minimumCoveragePercent,

    /*
     * نفس القيمة كنسبة عشرية
     * للاستخدام الآمن عند الحاجة.
     *
     * 70% = 0.70
     */

    minimumCoverage:
      minimumCoveragePercent / 100,

    /*
     * أقصى عدد صفحات يمكن لـDiscovery
     * فحصها.
     */

    maxDiscoveryPages:
      envNumber(
        "MAX_DISCOVERY_PAGES",
        250
      ),

    /*
     * =====================================================
     * TIMEOUTS
     * =====================================================
     */

    /*
     * الاسم المستخدم في Workflow.
     */

    pageTimeoutMs:
      pageTimeoutMs,

    /*
     * الاسم المستخدم في Workflow.
     */

    navigationTimeoutMs:
      navigationTimeoutMs,

    /*
     * الاسم المستخدم حاليًا في discover.js.
     *
     * مهم جدًا حتى لا يرجع Discover
     * إلى القيمة الافتراضية القديمة.
     */

    navigationTimeout:
      navigationTimeoutMs,

    /*
     * انتظار تحميل المحتوى الديناميكي.
     */

    renderWaitMs:
      renderWaitMs,

    /*
     * انتظار بين صفحات Discovery.
     */

    pageDelay:
      pageDelay,

    /*
     * انتظار تسجيل الدخول.
     */

    loginWait:
      loginWait
  },


  /* =======================================================
     PRICING
     ======================================================= */

  pricing: {
    /*
     * السعر النهائي =
     * سعر Sawa9ly + هامش الربح.
     */

    defaultMargin:
      envNumber(
        "DEFAULT_MARGIN",
        1000
      ),

    /*
     * أقل هامش مسموح.
     */

    minMargin:
      envNumber(
        "MIN_MARGIN",
        300
      ),

    /*
     * أكبر هامش مسموح.
     */

    maxMargin:
      envNumber(
        "MAX_MARGIN",
        5000
      )
  },


  /* =======================================================
     PATHS
     ======================================================= */

  paths: {
    rootDir:
      ROOT_DIR,

    productsFile:
      process.env.PRODUCTS_FILE ||
      path.resolve(
        ROOT_DIR,
        "products.js"
      ),

    outputDir:
      process.env.OUTPUT_DIR ||
      path.resolve(
        __dirname,
        "output"
      ),

    debugDir:
      process.env.DEBUG_DIR ||
      path.resolve(
        __dirname,
        "debug"
      ),

    stateDir:
      process.env.STATE_DIR ||
      path.resolve(
        __dirname,
        "state"
      ),

    historyDir:
      process.env.HISTORY_DIR ||
      path.resolve(
        __dirname,
        "state",
        "history"
      ),

    backupDir:
      process.env.BACKUP_DIR ||
      path.resolve(
        __dirname,
        "backups"
      )
  },


  /* =======================================================
     BROWSER
     ======================================================= */

  browser: {
    userAgent:
      process.env.USER_AGENT ||
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

    viewport: {
      width:
        envNumber(
          "VIEWPORT_WIDTH",
          1440
        ),

      height:
        envNumber(
          "VIEWPORT_HEIGHT",
          900
        )
    },

    locale:
      process.env.BROWSER_LOCALE ||
      "fr-DZ",

    timezoneId:
      process.env.BROWSER_TIMEZONE ||
      "Africa/Algiers"
  },


  /* =======================================================
     SAFETY
     ======================================================= */

  safety: {
    /*
     * يمنع المصدر الفارغ من تدمير المنتجات.
     */

    requireNonEmptySource:
      true,

    /*
     * المنتجات غير المتوفرة لا تحذف.
     */

    keepUnavailableProducts:
      true,

    /*
     * الملفات التي يمنع نظام المزامنة
     * تعديلها نهائيًا.
     */

    protectedFiles: [
      "index.html",
      "database.js",
      "locations.js"
    ],

    /*
     * الكتابة الآمنة.
     */

    atomicWrite:
      true,

    /*
     * Backup قبل استبدال products.js.
     */

    createBackup:
      true
  }
};


/* =========================================================
   VALIDATION
   ========================================================= */

export function validateConfig() {
  const errors = [];


  /* -------------------------------------------------------
     SAWA9LY
     ------------------------------------------------------- */

  if (!config.sawa9ly.baseUrl) {
    errors.push(
      "SAWA9LY base URL is missing."
    );
  }

  if (!config.sawa9ly.loginUrl) {
    errors.push(
      "SAWA9LY login URL is missing."
    );
  }

  if (!config.sawa9ly.dashboardUrl) {
    errors.push(
      "SAWA9LY dashboard URL is missing."
    );
  }

  if (!config.sawa9ly.email) {
    errors.push(
      "SAWA9LY_EMAIL is missing. " +
      "Add it to GitHub Actions Secrets."
    );
  }

  if (!config.sawa9ly.password) {
    errors.push(
      "SAWA9LY_PASSWORD is missing. " +
      "Add it to GitHub Actions Secrets."
    );
  }


  /* -------------------------------------------------------
     SCRAPING
     ------------------------------------------------------- */

  if (
    !Number.isFinite(
      config.automation.scrapeLimit
    ) ||
    config.automation.scrapeLimit < 1
  ) {
    errors.push(
      "SCRAPE_LIMIT must be a positive number."
    );
  }

  if (
    !Number.isFinite(
      config.automation.concurrency
    ) ||
    config.automation.concurrency < 1
  ) {
    errors.push(
      "SCRAPE_CONCURRENCY must be a positive number."
    );
  }

  if (
    !Number.isFinite(
      config.automation.scrapeConcurrency
    ) ||
    config.automation.scrapeConcurrency < 1
  ) {
    errors.push(
      "scrapeConcurrency must be a positive number."
    );
  }


  /* -------------------------------------------------------
     DISCOVERY
     ------------------------------------------------------- */

  if (
    !Number.isFinite(
      config.automation.maxDiscoveryPages
    ) ||
    config.automation.maxDiscoveryPages < 1
  ) {
    errors.push(
      "MAX_DISCOVERY_PAGES must be a positive number."
    );
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


  /* -------------------------------------------------------
     COVERAGE
     ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     TIMEOUTS
     ------------------------------------------------------- */

  if (
    !Number.isFinite(
      config.automation.pageTimeoutMs
    ) ||
    config.automation.pageTimeoutMs < 1000
  ) {
    errors.push(
      "PAGE_TIMEOUT_MS must be at least 1000 ms."
    );
  }

  if (
    !Number.isFinite(
      config.automation.navigationTimeoutMs
    ) ||
    config.automation.navigationTimeoutMs < 1000
  ) {
    errors.push(
      "NAVIGATION_TIMEOUT_MS must be at least 1000 ms."
    );
  }

  if (
    !Number.isFinite(
      config.automation.renderWaitMs
    ) ||
    config.automation.renderWaitMs < 0
  ) {
    errors.push(
      "RENDER_WAIT_MS cannot be negative."
    );
  }


  /* -------------------------------------------------------
     PRICING
     ------------------------------------------------------- */

  if (
    !Number.isFinite(
      config.pricing.defaultMargin
    )
  ) {
    errors.push(
      "DEFAULT_MARGIN must be a number."
    );
  }

  if (
    !Number.isFinite(
      config.pricing.minMargin
    ) ||
    !Number.isFinite(
      config.pricing.maxMargin
    ) ||
    config.pricing.minMargin < 0 ||
    config.pricing.maxMargin <
      config.pricing.minMargin
  ) {
    errors.push(
      "Invalid pricing margin configuration."
    );
  }


  /* -------------------------------------------------------
     FINAL
     ------------------------------------------------------- */

  if (errors.length > 0) {
    throw new Error(
      "Configuration validation failed:\n- " +
      errors.join("\n- ")
    );
  }

  return true;
}


/* =========================================================
   SAFE CONFIGURATION SUMMARY
   ========================================================= */

export function printConfigSummary() {
  console.log(
    "\n=================================================="
  );

  console.log(
    " PRIX-CHOC AUTOMATION CONFIGURATION"
  );

  console.log(
    "=================================================="
  );


  console.log("\nSawa9ly:");

  console.log(
    `  Base URL:        ${config.sawa9ly.baseUrl}`
  );

  console.log(
    `  Login URL:       ${config.sawa9ly.loginUrl}`
  );

  console.log(
    `  Store URL:       ${config.sawa9ly.dashboardUrl}`
  );

  console.log(
    `  Email:           ${
      config.sawa9ly.email
        ? "configured"
        : "MISSING"
    }`
  );

  console.log(
    `  Password:        ${
      config.sawa9ly.password
        ? "configured"
        : "MISSING"
    }`
  );


  console.log("\nAutomation:");

  console.log(
    `  Scrape limit:    ${config.automation.scrapeLimit}`
  );

  console.log(
    `  Concurrency:     ${config.automation.concurrency}`
  );

  console.log(
    `  Headless:        ${config.automation.headless}`
  );

  console.log(
    `  Dry run:         ${config.automation.dryRun}`
  );

  console.log(
    `  Missing runs:    ${config.automation.missingConfirmationRuns}`
  );

  console.log(
    `  Min coverage:    ${config.automation.minimumCoveragePercent}%`
  );

  console.log(
    `  Max pages:       ${config.automation.maxDiscoveryPages}`
  );

  console.log(
    `  Navigation:      ${config.automation.navigationTimeoutMs} ms`
  );

  console.log(
    `  Render wait:     ${config.automation.renderWaitMs} ms`
  );

  console.log(
    `  Page delay:      ${config.automation.pageDelay} ms`
  );

  console.log(
    `  Login wait:      ${config.automation.loginWait} ms`
  );


  console.log("\nPricing:");

  console.log(
    `  Default margin:  ${config.pricing.defaultMargin} DA`
  );

  console.log(
    `  Min margin:      ${config.pricing.minMargin} DA`
  );

  console.log(
    `  Max margin:      ${config.pricing.maxMargin} DA`
  );


  console.log("\nSafety:");

  console.log(
    `  Keep unavailable: ${
      config.safety.keepUnavailableProducts
    }`
  );

  console.log(
    `  Atomic write:     ${
      config.safety.atomicWrite
    }`
  );

  console.log(
    `  Backup:           ${
      config.safety.createBackup
    }`
  );


  console.log("\nPaths:");

  console.log(
    `  Products:        ${config.paths.productsFile}`
  );

  console.log(
    `  Output:          ${config.paths.outputDir}`
  );

  console.log(
    `  Debug:           ${config.paths.debugDir}`
  );

  console.log(
    `  State:           ${config.paths.stateDir}`
  );

  console.log(
    `  History:         ${config.paths.historyDir}`
  );

  console.log(
    `  Backups:         ${config.paths.backupDir}`
  );

  console.log(
    "==================================================\n"
  );
}


export default config;
