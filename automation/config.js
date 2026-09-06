import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");

export const config = {
    /* =========================================================
       SAWA9LY AFFILIATE
       ========================================================= */

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


    /* =========================================================
       AUTOMATION
       ========================================================= */

    automation: {
        /*
         * يجب أن يكون أكبر من عدد المنتجات المتوقع
         * حتى لا نقوم بتحديث أول 20 منتجا فقط.
         *
         * إذا كان عدد المنتجات أقل من هذا الرقم،
         * scraper.js سيستخدم جميع المنتجات المكتشفة.
         */

        scrapeLimit: Number(
            process.env.SCRAPE_LIMIT || 2094
        ),

        /*
         * عدد صفحات Playwright التي تعمل بالتوازي.
         */

        scrapeConcurrency: Number(
            process.env.SCRAPE_CONCURRENCY || 8
        ),

        /*
         * GitHub Actions يعمل بدون واجهة.
         */

        headless:
            String(
                process.env.HEADLESS || "true"
            ).toLowerCase() === "true",

        /*
         * لا نريد Dry Run في الإنتاج.
         */

        dryRun:
            String(
                process.env.DRY_RUN || "false"
            ).toLowerCase() === "true",

        /*
         * عدد دورات discovery المتتالية التي يجب
         * أن تؤكد اختفاء المنتج قبل اعتباره غير متوفر.
         */

        missingConfirmationRuns: Number(
            process.env.MISSING_CONFIRMATION_RUNS || 2
        ),

        /*
         * أقل تغطية مقبولة للـ scraper.
         *
         * 70% = إذا فشل أكثر من 30%
         * لا يسمح النظام بنشر تحديث ناقص.
         */

        minimumCoveragePercent: Number(
            process.env.MINIMUM_COVERAGE_PERCENT || 70
        ),

        /*
         * الحد الأقصى لصفحات Sawa9ly التي يمكن
         * لـ discover.js فحصها.
         */

        maxDiscoveryPages: Number(
            process.env.MAX_DISCOVERY_PAGES || 250
        ),

        /*
         * أوقات الانتظار.
         */

        navigationTimeout: Number(
            process.env.NAVIGATION_TIMEOUT || 60000
        ),

        renderWaitMs: Number(
            process.env.RENDER_WAIT_MS || 1800
        )
    },


    /* =========================================================
       PRICING
       ========================================================= */

    pricing: {
        /*
         * السعر النهائي =
         * سعر Sawa9ly + هامش الربح
         */

        defaultMargin: Number(
            process.env.DEFAULT_MARGIN || 1000
        ),

        minMargin: Number(
            process.env.MIN_MARGIN || 300
        ),

        maxMargin: Number(
            process.env.MAX_MARGIN || 5000
        )
    },


    /* =========================================================
       PATHS
       ========================================================= */

    paths: {
        rootDir,

        productsFile: path.resolve(
            rootDir,
            process.env.PRODUCTS_FILE || "products.js"
        ),

        outputDir: path.resolve(
            __dirname,
            process.env.OUTPUT_DIR || "output"
        ),

        debugDir: path.resolve(
            __dirname,
            process.env.DEBUG_DIR || "debug"
        ),

        stateDir: path.resolve(
            __dirname,
            process.env.STATE_DIR || "state"
        ),

        historyDir: path.resolve(
            __dirname,
            process.env.HISTORY_DIR || "history"
        ),

        backupDir: path.resolve(
            __dirname,
            process.env.BACKUP_DIR || "backups"
        )
    },


    /* =========================================================
       BROWSER
       ========================================================= */

    browser: {
        viewport: {
            width: Number(
                process.env.BROWSER_WIDTH || 1440
            ),

            height: Number(
                process.env.BROWSER_HEIGHT || 900
            )
        },

        locale:
            process.env.BROWSER_LOCALE ||
            "fr-DZ",

        timezoneId:
            process.env.BROWSER_TIMEZONE ||
            "Africa/Algiers",

        userAgent:
            process.env.BROWSER_USER_AGENT ||
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    },


    /* =========================================================
       SAFETY
       ========================================================= */

    safety: {
        /*
         * هذه الملفات ممنوع على نظام المزامنة
         * تعديلها إطلاقا.
         */

        protectedFiles: [
            "index.html",
            "database.js",
            "locations.js"
        ],

        /*
         * المنتجات المختفية لا تحذف من products.js.
         */

        keepUnavailableProducts: true,

        /*
         * الكتابة الآمنة.
         */

        atomicWrites: true,

        createBackups: true
    }
};


/* =========================================================
   VALIDATION
   ========================================================= */

export function validateConfig() {
    const errors = [];

    if (!config.sawa9ly.baseUrl) {
        errors.push(
            "SAWA9LY_BASE_URL is missing"
        );
    }

    if (!config.sawa9ly.loginUrl) {
        errors.push(
            "SAWA9LY_LOGIN_URL is missing"
        );
    }

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

    if (
        !Number.isFinite(
            config.automation.scrapeLimit
        ) ||
        config.automation.scrapeLimit < 1
    ) {
        errors.push(
            "SCRAPE_LIMIT must be a positive number"
        );
    }

    if (
        !Number.isFinite(
            config.automation.scrapeConcurrency
        ) ||
        config.automation.scrapeConcurrency < 1
    ) {
        errors.push(
            "SCRAPE_CONCURRENCY must be a positive number"
        );
    }

    if (
        !Number.isFinite(
            config.automation.minimumCoveragePercent
        ) ||
        config.automation.minimumCoveragePercent < 1 ||
        config.automation.minimumCoveragePercent > 100
    ) {
        errors.push(
            "MINIMUM_COVERAGE_PERCENT must be between 1 and 100"
        );
    }

    if (errors.length > 0) {
        console.error(
            "\n❌ Configuration errors:\n"
        );

        for (const error of errors) {
            console.error(`- ${error}`);
        }

        console.error(
            "\nأنشئ ملف automation/.env وضع بيانات حساب Sawa9ly داخله."
        );

        process.exit(1);
    }

    return true;
}


/* =========================================================
   CONFIG SUMMARY
   ========================================================= */

export function printConfigSummary() {
    console.log("");
    console.log(
        "=================================================="
    );
    console.log(
        " PRIX CHOC - AUTOMATION CONFIGURATION"
    );
    console.log(
        "=================================================="
    );

    console.log(
        `🌐 Sawa9ly       : ${config.sawa9ly.baseUrl}`
    );

    console.log(
        `🔐 Login         : ${config.sawa9ly.loginUrl}`
    );

    console.log(
        `📦 Store         : ${config.sawa9ly.dashboardUrl}`
    );

    console.log(
        `🔎 Scrape limit  : ${config.automation.scrapeLimit}`
    );

    console.log(
        `⚙️ Concurrency   : ${config.automation.scrapeConcurrency}`
    );

    console.log(
        `📊 Min coverage  : ${config.automation.minimumCoveragePercent}%`
    );

    console.log(
        `📄 Products      : ${config.paths.productsFile}`
    );

    console.log(
        `🛡️ Protected     : ${config.safety.protectedFiles.join(", ")}`
    );

    console.log(
        "=================================================="
    );
    console.log("");
}
