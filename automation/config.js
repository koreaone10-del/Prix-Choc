import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
=========================================================
 PRIX-CHOC
 Sawa9ly Affiliate Automation Configuration
=========================================================

هذا الملف هو مركز إعدادات نظام المزامنة.

الهدف:
- الاتصال بمنصة Sawa9ly Affiliate الجديدة.
- اكتشاف جميع المنتجات.
- Scraping للمنتجات الجديدة والموجودة.
- تحديث الأسعار والصور.
- المحافظة على المنتجات القديمة.
- إدارة available بدون حذف المنتجات.
- تشغيل النظام تلقائياً عبر GitHub Actions.
=========================================================
*/

function envString(name, fallback = "") {
    const value = process.env[name];

    if (value === undefined || value === null) {
        return fallback;
    }

    return String(value).trim();
}

function envNumber(name, fallback) {
    const value = Number(process.env[name]);

    if (!Number.isFinite(value)) {
        return fallback;
    }

    return value;
}

function envBoolean(name, fallback) {
    const value = process.env[name];

    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    return ["true", "1", "yes", "on"].includes(
        String(value).trim().toLowerCase()
    );
}

/*
=========================================================
 SAWA9LY
=========================================================
*/

const sawa9lyLoginUrl = envString(
    "SAWA9LY_LOGIN_URL",
    "https://affiliate.sawa9ly.pro/"
);

const sawa9lyDashboardUrl = envString(
    "SAWA9LY_DASHBOARD_URL",
    "https://affiliate.sawa9ly.pro/store"
);

const sawa9lyBaseUrl = envString(
    "SAWA9LY_BASE_URL",
    "https://affiliate.sawa9ly.pro"
);

/*
=========================================================
 AUTOMATION
=========================================================
*/

const scrapeLimit = Math.max(
    1,
    envNumber("SCRAPE_LIMIT", 2094)
);

const concurrency = Math.max(
    1,
    envNumber("SCRAPE_CONCURRENCY", 8)
);

const maxDiscoveryPages = Math.max(
    1,
    envNumber("MAX_DISCOVERY_PAGES", 100)
);

/*
عدد مرات غياب المنتج قبل تحويله إلى:

available: false

مهم:
لا يتم حذف المنتج من products.js.
*/

const missingConfirmationRuns = Math.max(
    1,
    envNumber("MISSING_CONFIRMATION_RUNS", 2)
);

/*
Headless:
GitHub Actions يجب أن تعمل بدون واجهة رسومية.
*/

const headless = envBoolean(
    "HEADLESS",
    true
);

/*
Dry Run:
في التشغيل الحقيقي يجب أن يكون false.

إذا كان true:
- يمكن تنفيذ القراءة/scraping.
- لكن لا نريد نشر تغييرات فعلية على products.js.

القيمة الافتراضية هنا false لأن النظام النهائي
مصمم للعمل تلقائياً.
*/

const dryRun = envBoolean(
    "DRY_RUN",
    false
);

/*
=========================================================
 TIMEOUTS / RETRIES
=========================================================
*/

const navigationTimeout = Math.max(
    10000,
    envNumber("NAVIGATION_TIMEOUT", 60000)
);

const selectorTimeout = Math.max(
    1000,
    envNumber("SELECTOR_TIMEOUT", 15000)
);

const pageDelay = Math.max(
    0,
    envNumber("PAGE_DELAY", 1800)
);

const productDelay = Math.max(
    0,
    envNumber("PRODUCT_DELAY", 300)
);

const loginWait = Math.max(
    1000,
    envNumber("LOGIN_WAIT", 5000)
);

const retryCount = Math.max(
    0,
    envNumber("SCRAPE_RETRIES", 2)
);

/*
=========================================================
 PRICING
=========================================================

السعر النهائي:

basePrice + margin

مع حماية:
minMargin <= margin <= maxMargin
=========================================================
*/

const defaultMargin = envNumber(
    "DEFAULT_MARGIN",
    1000
);

const minMargin = envNumber(
    "MIN_MARGIN",
    300
);

const maxMargin = envNumber(
    "MAX_MARGIN",
    5000
);

/*
=========================================================
 FILE PATHS
=========================================================
*/

const productsFile = path.resolve(
    __dirname,
    envString(
        "PRODUCTS_FILE",
        "../products.js"
    )
);

const outputDir = path.resolve(
    __dirname,
    envString(
        "OUTPUT_DIR",
        "./output"
    )
);

const stateDir = path.resolve(
    __dirname,
    envString(
        "STATE_DIR",
        "./state"
    )
);

const debugDir = path.resolve(
    __dirname,
    envString(
        "DEBUG_DIR",
        "./debug"
    )
);

/*
=========================================================
 CONFIG OBJECT
=========================================================
*/

export const config = {
    /*
    -----------------------------------------------------
    Sawa9ly Affiliate
    -----------------------------------------------------
    */

    sawa9ly: {
        baseUrl: sawa9lyBaseUrl,

        loginUrl: sawa9lyLoginUrl,

        dashboardUrl: sawa9lyDashboardUrl,

        email: envString(
            "SAWA9LY_EMAIL",
            ""
        ),

        password: envString(
            "SAWA9LY_PASSWORD",
            ""
        )
    },

    /*
    -----------------------------------------------------
    Automation
    -----------------------------------------------------
    */

    automation: {
        scrapeLimit,

        concurrency,

        maxDiscoveryPages,

        missingConfirmationRuns,

        headless,

        dryRun,

        navigationTimeout,

        selectorTimeout,

        pageDelay,

        productDelay,

        loginWait,

        retryCount
    },

    /*
    -----------------------------------------------------
    Pricing
    -----------------------------------------------------
    */

    pricing: {
        defaultMargin,

        minMargin,

        maxMargin
    },

    /*
    -----------------------------------------------------
    Paths
    -----------------------------------------------------
    */

    paths: {
        productsFile,

        outputDir,

        stateDir,

        debugDir
    }
};

/*
=========================================================
 VALIDATION
=========================================================
*/

export function validateConfig() {
    const errors = [];

    /*
    Sawa9ly credentials
    */

    if (!config.sawa9ly.email) {
        errors.push(
            "SAWA9LY_EMAIL is missing"
        );
    }

    if (!config.sawa9ly.password) {
        errors.push(
            "SAWA9LY_PASSWORD is missing"
        );
    }

    /*
    URLs
    */

    if (!config.sawa9ly.loginUrl) {
        errors.push(
            "SAWA9LY_LOGIN_URL is missing"
        );
    }

    if (!config.sawa9ly.dashboardUrl) {
        errors.push(
            "SAWA9LY_DASHBOARD_URL is missing"
        );
    }

    /*
    Pricing validation
    */

    if (
        !Number.isFinite(config.pricing.defaultMargin)
    ) {
        errors.push(
            "DEFAULT_MARGIN must be a valid number"
        );
    }

    if (
        !Number.isFinite(config.pricing.minMargin)
    ) {
        errors.push(
            "MIN_MARGIN must be a valid number"
        );
    }

    if (
        !Number.isFinite(config.pricing.maxMargin)
    ) {
        errors.push(
            "MAX_MARGIN must be a valid number"
        );
    }

    if (
        config.pricing.minMargin >
        config.pricing.maxMargin
    ) {
        errors.push(
            "MIN_MARGIN cannot be greater than MAX_MARGIN"
        );
    }

    /*
    Automation validation
    */

    if (
        config.automation.scrapeLimit < 1
    ) {
        errors.push(
            "SCRAPE_LIMIT must be greater than 0"
        );
    }

    if (
        config.automation.concurrency < 1
    ) {
        errors.push(
            "SCRAPE_CONCURRENCY must be greater than 0"
        );
    }

    if (
        config.automation.maxDiscoveryPages < 1
    ) {
        errors.push(
            "MAX_DISCOVERY_PAGES must be greater than 0"
        );
    }

    if (
        config.automation.missingConfirmationRuns < 1
    ) {
        errors.push(
            "MISSING_CONFIRMATION_RUNS must be greater than 0"
        );
    }

    /*
    -----------------------------------------------------
    Stop immediately if configuration is invalid.
    -----------------------------------------------------
    */

    if (errors.length > 0) {
        console.error("");
        console.error(
            "======================================"
        );
        console.error(
            "   ❌ PRIX-CHOC CONFIGURATION ERROR"
        );
        console.error(
            "======================================"
        );
        console.error("");

        for (const error of errors) {
            console.error(`- ${error}`);
        }

        console.error("");
        console.error(
            "تأكد من ملف automation/.env"
        );
        console.error(
            "وتأكد من GitHub Secrets عند تشغيل GitHub Actions."
        );
        console.error("");

        process.exit(1);
    }

    return true;
}

/*
=========================================================
 DEBUG / SAFE SUMMARY
=========================================================

لا نطبع كلمة المرور أبداً.
=========================================================
*/

export function printConfigSummary() {
    console.log("");
    console.log(
        "======================================"
    );
    console.log(
        "     PRIX-CHOC AUTOMATION CONFIG"
    );
    console.log(
        "======================================"
    );

    console.log(
        `Sawa9ly Base URL : ${config.sawa9ly.baseUrl}`
    );

    console.log(
        `Login URL        : ${config.sawa9ly.loginUrl}`
    );

    console.log(
        `Dashboard URL    : ${config.sawa9ly.dashboardUrl}`
    );

    console.log(
        `Email configured : ${
            config.sawa9ly.email ? "YES" : "NO"
        }`
    );

    console.log(
        `Password set     : ${
            config.sawa9ly.password ? "YES" : "NO"
        }`
    );

    console.log(
        `Scrape limit     : ${config.automation.scrapeLimit}`
    );

    console.log(
        `Concurrency      : ${config.automation.concurrency}`
    );

    console.log(
        `Max pages        : ${config.automation.maxDiscoveryPages}`
    );

    console.log(
        `Missing runs     : ${config.automation.missingConfirmationRuns}`
    );

    console.log(
        `Headless         : ${config.automation.headless}`
    );

    console.log(
        `Dry run          : ${config.automation.dryRun}`
    );

    console.log(
        `Default margin   : ${config.pricing.defaultMargin}`
    );

    console.log(
        `Min margin       : ${config.pricing.minMargin}`
    );

    console.log(
        `Max margin       : ${config.pricing.maxMargin}`
    );

    console.log(
        `Products file    : ${config.paths.productsFile}`
    );

    console.log(
        `Output directory : ${config.paths.outputDir}`
    );

    console.log(
        `State directory  : ${config.paths.stateDir}`
    );

    console.log(
        `Debug directory  : ${config.paths.debugDir}`
    );

    console.log(
        "======================================"
    );
    console.log("");
}

/*
=========================================================
 OPTIONAL DIRECT EXECUTION
=========================================================
*/

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) ===
        path.resolve(fileURLToPath(import.meta.url))
) {
    validateConfig();
    printConfigSummary();
}
