import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { config, validateConfig } from "./config.js";

/*
=========================================================
 PRIX-CHOC
 SAWA9LY FULL PRODUCT DISCOVERY
=========================================================

الوظيفة:

1. تسجيل الدخول إلى Sawa9ly Affiliate.
2. فتح كتالوج المنتجات.
3. اكتشاف جميع صفحات المنتجات.
4. دعم:
      /store/123
      /product/123
5. تحويل روابط المنتجات إلى صيغة موحدة:
      /store/123
6. منع اعتبار الكتالوج فارغاً بسبب خطأ مؤقت.
7. حفظ قائمة المنتجات المكتشفة.
8. حفظ تقرير كامل عن عملية Discovery.
9. حفظ تاريخ Discovery.
10. حساب المنتجات التي اختفت.
11. عدم حذف أي منتج من products.js.
12. عدم اعتبار المنتج غير متوفر إلا بعد
    عدد محدد من عمليات Discovery الناجحة.

مهم جداً:

Discovery لا يعدّل products.js.

هو فقط ينتج البيانات التي سيستخدمها Generator لاحقاً.
=========================================================
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
=========================================================
 DIRECTORIES
=========================================================
*/

const debugDir = path.resolve(
    __dirname,
    config.paths.debugDir || "./debug"
);

const stateDir = path.resolve(
    __dirname,
    config.paths.stateDir || "./state"
);

fs.mkdirSync(debugDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

/*
=========================================================
 OUTPUT FILES
=========================================================
*/

const linksFile = path.join(
    debugDir,
    "product-links.json"
);

const progressFile = path.join(
    debugDir,
    "product-links-progress.json"
);

const reportFile = path.join(
    debugDir,
    "discovery-report.json"
);

const dashboardFile = path.join(
    debugDir,
    "dashboard.html"
);

const historyFile = path.join(
    stateDir,
    "discovery-history.json"
);

/*
=========================================================
 SETTINGS
=========================================================
*/

const MAX_PAGES = Math.max(
    1,
    Number(config.automation.maxDiscoveryPages || 100)
);

const NAVIGATION_TIMEOUT = Math.max(
    10000,
    Number(config.automation.navigationTimeout || 60000)
);

const PAGE_DELAY = Math.max(
    0,
    Number(config.automation.pageDelay || 1800)
);

const LOGIN_WAIT = Math.max(
    1000,
    Number(config.automation.loginWait || 5000)
);

const MISSING_CONFIRMATION_RUNS = Math.max(
    1,
    Number(
        config.automation.missingConfirmationRuns || 2
    )
);

/*
=========================================================
 HELPERS
=========================================================
*/

function cleanText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

/*
---------------------------------------------------------
 Safe JSON read
---------------------------------------------------------
*/

function readJson(file, fallback = null) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const raw = fs.readFileSync(
            file,
            "utf8"
        );

        if (!raw.trim()) {
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.warn(
            `⚠️ Could not read JSON: ${file}`
        );

        return fallback;
    }
}

/*
---------------------------------------------------------
 Safe JSON write
---------------------------------------------------------
*/

function writeJson(file, value) {
    const temporaryFile = `${file}.tmp`;

    fs.writeFileSync(
        temporaryFile,
        JSON.stringify(
            value,
            null,
            2
        ),
        "utf8"
    );

    fs.renameSync(
        temporaryFile,
        file
    );
}

/*
---------------------------------------------------------
 Remove stale outputs before a new discovery
---------------------------------------------------------
*/

function removeStaleDiscoveryOutputs() {
    const files = [
        linksFile,
        progressFile,
        reportFile
    ];

    for (const file of files) {
        try {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        } catch (error) {
            console.warn(
                `⚠️ Could not remove old file: ${file}`
            );
        }
    }
}

/*
=========================================================
 URL HELPERS
=========================================================
*/

/*
---------------------------------------------------------
 Extract Sawa9ly product ID

Supported:

https://affiliate.sawa9ly.pro/store/123
https://affiliate.sawa9ly.pro/store/123?foo=bar

and legacy:

https://affiliate.sawa9ly.pro/product/123
https://affiliate.sawa9ly.pro/product/123?foo=bar
---------------------------------------------------------
*/

function extractProductId(value) {
    const raw = String(value || "");

    const patterns = [
        /\/store\/(\d+)(?:[/?#]|$)/i,
        /\/product\/(\d+)(?:[/?#]|$)/i
    ];

    for (const pattern of patterns) {
        const match = raw.match(pattern);

        if (match) {
            return String(match[1]);
        }
    }

    return "";
}

/*
---------------------------------------------------------
 Normalize product URL

Everything becomes:

https://affiliate.sawa9ly.pro/store/ID

This is important because old and new links can coexist.
---------------------------------------------------------
*/

function normalizeProductUrl(value) {
    try {
        const url = new URL(
            String(value || "")
        );

        const id = extractProductId(
            url.href
        );

        if (!id) {
            return "";
        }

        const baseUrl =
            config.sawa9ly.baseUrl ||
            "https://affiliate.sawa9ly.pro";

        return `${String(baseUrl).replace(/\/+$/, "")}/store/${id}`;
    } catch {
        return "";
    }
}

/*
---------------------------------------------------------
 Check if URL is a product URL
---------------------------------------------------------
*/

function isProductUrl(value) {
    return Boolean(
        extractProductId(value)
    );
}

/*
---------------------------------------------------------
 Create pagination URL
---------------------------------------------------------
*/

function makePageUrl(
    baseUrl,
    pageNumber
) {
    const url = new URL(
        baseUrl
    );

    url.searchParams.set(
        "page",
        String(pageNumber)
    );

    return url.toString();
}

/*
=========================================================
 PAGE / PAGINATION HELPERS
=========================================================
*/

function extractPageNumber(value) {
    try {
        const url = new URL(
            String(value || "")
        );

        const page =
            Number(
                url.searchParams.get("page")
            );

        if (
            Number.isInteger(page) &&
            page > 0
        ) {
            return page;
        }

        return null;
    } catch {
        return null;
    }
}

/*
---------------------------------------------------------
 Detect pagination from links
---------------------------------------------------------
*/

async function detectPagination(page) {
    const links =
        await page.locator("a").evaluateAll(
            anchors =>
                anchors
                    .map(anchor => ({
                        text: cleanText(
                            anchor.innerText
                        ),
                        href: anchor.href
                    }))
                    .filter(
                        item =>
                            item.href
                    )
        );

    const pageNumbers = [];

    for (const item of links) {
        const number =
            extractPageNumber(
                item.href
            );

        if (
            Number.isInteger(number) &&
            number > 0
        ) {
            pageNumbers.push(number);
        }
    }

    const uniquePages = [
        ...new Set(pageNumbers)
    ].sort(
        (a, b) => a - b
    );

    return uniquePages;
}

/*
=========================================================
 PRODUCT LINK EXTRACTION
=========================================================
*/

async function extractProductsFromPage(
    page
) {
    const anchors =
        await page.locator("a").evaluateAll(
            elements =>
                elements.map(anchor => ({
                    text: cleanText(
                        anchor.innerText
                    ),
                    href: anchor.href,
                    title:
                        cleanText(
                            anchor.getAttribute(
                                "title"
                            )
                        )
                }))
        );

    const productsById = new Map();

    for (const anchor of anchors) {
        const id =
            extractProductId(
                anchor.href
            );

        if (!id) {
            continue;
        }

        const normalized =
            normalizeProductUrl(
                anchor.href
            );

        if (!normalized) {
            continue;
        }

        /*
        Prefer the normalized store URL.
        */

        if (
            !productsById.has(id)
        ) {
            productsById.set(
                id,
                {
                    id,
                    href: normalized,
                    text:
                        anchor.text || "",
                    title:
                        anchor.title || ""
                }
            );
        }
    }

    return [
        ...productsById.values()
    ];
}

/*
=========================================================
 LOGIN
=========================================================
*/

async function login(page) {
    console.log("");
    console.log(
        "1) Opening Sawa9ly Affiliate login..."
    );

    await page.goto(
        config.sawa9ly.loginUrl,
        {
            waitUntil:
                "domcontentloaded",
            timeout:
                NAVIGATION_TIMEOUT
        }
    );

    await page.waitForTimeout(
        2000
    );

    /*
    -----------------------------------------------------
    Find login inputs
    -----------------------------------------------------
    */

    const emailInput =
        page.locator(
            'input[type="email"]'
        ).first();

    const passwordInput =
        page.locator(
            'input[type="password"]'
        ).first();

    const emailCount =
        await page.locator(
            'input[type="email"]'
        ).count();

    const passwordCount =
        await page.locator(
            'input[type="password"]'
        ).count();

    /*
    -----------------------------------------------------
    If already authenticated
    -----------------------------------------------------
    */

    if (
        emailCount === 0 &&
        passwordCount === 0
    ) {
        /*
        It may be an already authenticated
        session or an SPA loading screen.

        Give it additional time.
        */

        await page.waitForTimeout(
            LOGIN_WAIT
        );

        const stillHasLogin =
            await page.locator(
                'input[type="password"]'
            ).count();

        if (
            stillHasLogin === 0
        ) {
            console.log(
                "ℹ️ Login form not displayed; continuing with current session."
            );

            return;
        }
    }

    /*
    -----------------------------------------------------
    Login form must exist if credentials are required.
    -----------------------------------------------------
    */

    if (
        await page.locator(
            'input[type="email"]'
        ).count() === 0 ||
        await page.locator(
            'input[type="password"]'
        ).count() === 0
    ) {
        throw new Error(
            "لم يتم العثور على حقول تسجيل الدخول في Sawa9ly Affiliate."
        );
    }

    console.log(
        "Login form detected."
    );

    await emailInput.fill(
        config.sawa9ly.email
    );

    await passwordInput.fill(
        config.sawa9ly.password
    );

    const submitButton =
        page.locator(
            'button[type="submit"]'
        ).first();

    if (
        await submitButton.count() > 0
    ) {
        await submitButton.click();
    } else {
        await passwordInput.press(
            "Enter"
        );
    }

    await page.waitForTimeout(
        LOGIN_WAIT
    );

    /*
    -----------------------------------------------------
    Check if still on login.
    -----------------------------------------------------
    */

    const currentUrl =
        page.url();

    if (
        /\/login(?:[/?#]|$)/i.test(
            currentUrl
        )
    ) {
        throw new Error(
            "فشل تسجيل الدخول إلى Sawa9ly Affiliate. بقيت الصفحة على /login."
        );
    }

    console.log(
        "✅ Login successful."
    );
}

/*
=========================================================
 OPEN CATALOG
=========================================================
*/

async function openCatalog(page) {
    console.log("");
    console.log(
        "2) Opening Sawa9ly product catalog..."
    );

    const firstPageUrl =
        makePageUrl(
            config.sawa9ly.dashboardUrl,
            1
        );

    await page.goto(
        firstPageUrl,
        {
            waitUntil:
                "domcontentloaded",
            timeout:
                NAVIGATION_TIMEOUT
        }
    );

    await page.waitForTimeout(
        PAGE_DELAY
    );

    const currentUrl =
        page.url();

    if (
        /\/login(?:[/?#]|$)/i.test(
            currentUrl
        )
    ) {
        throw new Error(
            "Sawa9ly أعاد توجيه الجلسة إلى /login."
        );
    }

    /*
    Save HTML for diagnostics.
    */

    try {
        fs.writeFileSync(
            dashboardFile,
            await page.content(),
            "utf8"
        );
    } catch {
        console.warn(
            "⚠️ Could not save dashboard.html"
        );
    }

    console.log(
        `Catalog opened: ${currentUrl}`
    );
}

/*
=========================================================
 DISCOVER PAGE COUNT
=========================================================
*/

async function discoverPageCount(
    page
) {
    console.log("");
    console.log(
        "3) Detecting catalog pagination..."
    );

    const detectedPages =
        await detectPagination(
            page
        );

    let maxPage =
        detectedPages.length > 0
            ? Math.max(
                ...detectedPages
            )
            : 1;

    /*
    -----------------------------------------------------
    Safety protection
    -----------------------------------------------------
    */

    if (
        maxPage >
        MAX_PAGES
    ) {
        throw new Error(
            `تم اكتشاف ${maxPage} صفحة، وهذا يتجاوز حد الأمان ${MAX_PAGES}.`
        );
    }

    /*
    Make sure page 1 is always included.
    */

    if (
        !detectedPages.includes(1)
    ) {
        detectedPages.unshift(1);
    }

    console.log(
        `Detected pages: ${
            detectedPages.join(", ")
        }`
    );

    console.log(
        `Pages to scan: ${maxPage}`
    );

    return {
        detectedPages,
        maxPage
    };
}

/*
=========================================================
 DISCOVERY
=========================================================
*/

async function discoverProducts(
    page,
    maxPage
) {
    console.log("");
    console.log(
        "4) Collecting product links..."
    );

    const allProducts =
        new Map();

    const pageCounts = {};

    const pageUrls = {};

    /*
    -----------------------------------------------------
    Scan every page.
    -----------------------------------------------------
    */

    for (
        let pageNumber = 1;
        pageNumber <= maxPage;
        pageNumber++
    ) {
        const pageUrl =
            makePageUrl(
                config.sawa9ly.dashboardUrl,
                pageNumber
            );

        console.log("");
        console.log(
            `--- PAGE ${pageNumber}/${maxPage} ---`
        );

        await page.goto(
            pageUrl,
            {
                waitUntil:
                    "domcontentloaded",
                timeout:
                    NAVIGATION_TIMEOUT
            }
        );

        await page.waitForTimeout(
            PAGE_DELAY
        );

        const currentUrl =
            page.url();

        /*
        -------------------------------------------------
        Session protection
        -------------------------------------------------
        */

        if (
            /\/login(?:[/?#]|$)/i.test(
                currentUrl
            )
        ) {
            throw new Error(
                `انتهت جلسة Sawa9ly في الصفحة ${pageNumber}.`
            );
        }

        pageUrls[
            String(pageNumber)
        ] = currentUrl;

        /*
        -------------------------------------------------
        Extract products
        -------------------------------------------------
        */

        const products =
            await extractProductsFromPage(
                page
            );

        pageCounts[
            String(pageNumber)
        ] = products.length;

        /*
        -------------------------------------------------
        Zero-product protection
        -------------------------------------------------

        لا نسمح لصفحة فارغة أن تجعلنا نعتبر
        آلاف المنتجات "مفقودة".
        -------------------------------------------------
        */

        if (
            products.length === 0
        ) {
            throw new Error(
                `Page ${pageNumber} returned ZERO product links. Discovery stopped safely.`
            );
        }

        /*
        -------------------------------------------------
        Add unique products
        -------------------------------------------------
        */

        for (const product of products) {
            allProducts.set(
                product.id,
                product
            );
        }

        /*
        -------------------------------------------------
        Save progress after every page
        -------------------------------------------------
        */

        writeJson(
            progressFile,
            {
                updatedAt:
                    new Date().toISOString(),

                pagesCompleted:
                    pageNumber,

                pagesTotal:
                    maxPage,

                productsFound:
                    allProducts.size,

                products:
                    [
                        ...allProducts.values()
                    ]
            }
        );

        console.log(
            `Products on page: ${products.length}`
        );

        console.log(
            `Total unique products: ${allProducts.size}`
        );
    }

    /*
    -----------------------------------------------------
    Final result
    -----------------------------------------------------
    */

    const finalProducts =
        [
            ...allProducts.values()
        ];

    if (
        finalProducts.length === 0
    ) {
        throw new Error(
            "Discovery returned ZERO products. Refusing to continue."
        );
    }

    return {
        products:
            finalProducts,

        pageCounts,

        pageUrls
    };
}

/*
=========================================================
 AVAILABILITY HISTORY
=========================================================
*/

function buildAvailabilityState(
    currentProducts
) {
    const previousHistory =
        readJson(
            historyFile,
            null
        );

    const previousIds =
        new Set(
            Array.isArray(
                previousHistory?.discoveredIds
            )
                ? previousHistory.discoveredIds
                    .map(String)
                    .filter(Boolean)
                : []
        );

    const previousStreaks =
        (
            previousHistory?.missingStreaks &&
            typeof previousHistory.missingStreaks ===
                "object"
        )
            ? previousHistory.missingStreaks
            : {};

    const currentIds =
        new Set(
            currentProducts
                .map(
                    product =>
                        String(
                            product.id
                        )
                )
                .filter(Boolean)
        );

    /*
    -----------------------------------------------------
    Missing products
    -----------------------------------------------------
    */

    const missingStreaks = {};

    const confirmedMissingIds = [];

    /*
    -----------------------------------------------------
    Products currently present
    -----------------------------------------------------

    We explicitly store 0.

    This makes the state clearer and prevents
    stale streak information from being accidentally
    reused.
    -----------------------------------------------------
    */

    for (const id of currentIds) {
        missingStreaks[id] = 0;
    }

    /*
    -----------------------------------------------------
    Products absent from current successful discovery
    -----------------------------------------------------
    */

    for (const id of previousIds) {
        if (
            currentIds.has(id)
        ) {
            continue;
        }

        const previousStreak =
            Number(
                previousStreaks[id] || 0
            );

        const newStreak =
            previousStreak + 1;

        missingStreaks[id] =
            newStreak;

        if (
            newStreak >=
            MISSING_CONFIRMATION_RUNS
        ) {
            confirmedMissingIds.push(
                id
            );
        }
    }

    return {
        previousIds:
            [
                ...previousIds
            ],

        currentIds:
            [
                ...currentIds
            ],

        missingStreaks,

        confirmedMissingIds
    };
}

/*
=========================================================
 SAFETY CHECK
=========================================================
*/

function evaluateDiscoverySafety({
    maxPage,
    pageCounts,
    products
}) {
    const pagesScanned =
        Object.keys(
            pageCounts
        ).length;

    const everyPageHasProducts =
        Object.values(
            pageCounts
        ).every(
            count =>
                Number(count) > 0
        );

    const correctPageCount =
        pagesScanned ===
        maxPage;

    const hasProducts =
        products.length > 0;

    const withinSafetyLimit =
        maxPage <=
        MAX_PAGES;

    /*
    -----------------------------------------------------
    Availability is safe ONLY if all conditions pass.
    -----------------------------------------------------
    */

    const availabilitySafe =
        correctPageCount &&
        everyPageHasProducts &&
        hasProducts &&
        withinSafetyLimit;

    return {
        availabilitySafe,

        checks: {
            correctPageCount,

            everyPageHasProducts,

            hasProducts,

            withinSafetyLimit
        }
    };
}

/*
=========================================================
 MAIN
=========================================================
*/

console.log("");
console.log(
    "=============================================="
);
console.log(
    "      PRIX-CHOC / SAWA9LY DISCOVERY"
);
console.log(
    "=============================================="
);
console.log("");

try {
    /*
    -----------------------------------------------------
    Validate configuration
    -----------------------------------------------------
    */

    validateConfig();

    /*
    -----------------------------------------------------
    Print safe configuration summary if available.
    -----------------------------------------------------
    */

    if (
        typeof config.printConfigSummary ===
        "function"
    ) {
        config.printConfigSummary();
    }

    /*
    -----------------------------------------------------
    Remove stale outputs.
    -----------------------------------------------------
    */

    removeStaleDiscoveryOutputs();

    /*
    -----------------------------------------------------
    Verify credentials.
    -----------------------------------------------------
    */

    if (
        !config.sawa9ly.email
    ) {
        throw new Error(
            "SAWA9LY_EMAIL is missing."
        );
    }

    if (
        !config.sawa9ly.password
    ) {
        throw new Error(
            "SAWA9LY_PASSWORD is missing."
        );
    }

    console.log(
        "Credentials detected."
    );

    /*
    -----------------------------------------------------
    Launch Chromium
    -----------------------------------------------------
    */

    console.log(
        "Launching Chromium..."
    );

    const browser =
        await chromium.launch({
            headless:
                config.automation.headless
        });

    const context =
        await browser.newContext({
            viewport: {
                width: 1440,
                height: 900
            },

            locale:
                "ar-DZ",

            timezoneId:
                "Africa/Algiers"
        });

    /*
    -----------------------------------------------------
    New page
    -----------------------------------------------------
    */

    const page =
        await context.newPage();

    page.setDefaultNavigationTimeout(
        NAVIGATION_TIMEOUT
    );

    /*
    -----------------------------------------------------
    Login
    -----------------------------------------------------
    */

    await login(
        page
    );

    /*
    -----------------------------------------------------
    Open catalog
    -----------------------------------------------------
    */

    await openCatalog(
        page
    );

    /*
    -----------------------------------------------------
    Detect pagination
    -----------------------------------------------------
    */

    const pagination =
        await discoverPageCount(
            page
        );

    /*
    -----------------------------------------------------
    Discover products
    -----------------------------------------------------
    */

    const discovery =
        await discoverProducts(
            page,
            pagination.maxPage
        );

    /*
    -----------------------------------------------------
    Safety evaluation
    -----------------------------------------------------
    */

    const safety =
        evaluateDiscoverySafety({
            maxPage:
                pagination.maxPage,

            pageCounts:
                discovery.pageCounts,

            products:
                discovery.products
        });

    /*
    -----------------------------------------------------
    Availability history
    -----------------------------------------------------
    */

    const availability =
        buildAvailabilityState(
            discovery.products
        );

    /*
    -----------------------------------------------------
    Build IDs
    -----------------------------------------------------
    */

    const discoveredIds =
        discovery.products
            .map(
                product =>
                    String(
                        product.id
                    )
            )
            .filter(Boolean);

    /*
    -----------------------------------------------------
    Duplicate protection
    -----------------------------------------------------
    */

    const uniqueDiscoveredIds =
        [
            ...new Set(
                discoveredIds
            )
        ];

    if (
        uniqueDiscoveredIds.length ===
        0
    ) {
        throw new Error(
            "No valid product IDs were discovered."
        );
    }

    /*
    -----------------------------------------------------
    Previous count
    -----------------------------------------------------
    */

    const previousCount =
        availability.previousIds
            .length;

    const currentCount =
        uniqueDiscoveredIds
            .length;

    const countDelta =
        currentCount -
        previousCount;

    /*
    -----------------------------------------------------
    Build final report
    -----------------------------------------------------
    */

    const report = {
        complete:
            true,

        availabilitySafe:
            safety.availabilitySafe,

        safetyChecks:
            safety.checks,

        pagesScanned:
            pagination.maxPage,

        detectedPages:
            pagination.detectedPages,

        productsFound:
            discovery.products.length,

        uniqueProductsFound:
            uniqueDiscoveredIds.length,

        previousProductsFound:
            previousCount,

        countDelta,

        pageCounts:
            discovery.pageCounts,

        pageUrls:
            discovery.pageUrls,

        discoveredIds:
            uniqueDiscoveredIds,

        missingStreaks:
            availability.missingStreaks,

        confirmedMissingIds:
            availability.confirmedMissingIds,

        missingConfirmationRuns:
            MISSING_CONFIRMATION_RUNS,

        generatedAt:
            new Date().toISOString()
    };

    /*
    -----------------------------------------------------
    FINAL SAFETY BLOCK
    -----------------------------------------------------

    If Discovery is unsafe, we still save the diagnostic
    result, but the caller can clearly see that availability
    decisions must NOT be trusted.
    -----------------------------------------------------
    */

    if (
        !safety.availabilitySafe
    ) {
        console.warn("");
        console.warn(
            "⚠️ DISCOVERY IS NOT AVAILABILITY-SAFE."
        );
        console.warn(
            "⚠️ Products will still be reported,"
        );
        console.warn(
            "⚠️ but availability changes must not be trusted."
        );
        console.warn("");
    }

    /*
    -----------------------------------------------------
    Save outputs
    -----------------------------------------------------
    */

    writeJson(
        linksFile,
        discovery.products
    );

    writeJson(
        reportFile,
        report
    );

    writeJson(
        historyFile,
        report
    );

    /*
    -----------------------------------------------------
    Success output
    -----------------------------------------------------
    */

    console.log("");
    console.log(
        "=============================================="
    );
    console.log(
        "           DISCOVERY COMPLETED"
    );
    console.log(
        "=============================================="
    );

    console.log(
        `Pages scanned       : ${pagination.maxPage}`
    );

    console.log(
        `Products discovered : ${discovery.products.length}`
    );

    console.log(
        `Unique product IDs  : ${uniqueDiscoveredIds.length}`
    );

    console.log(
        `Previous count      : ${previousCount}`
    );

    console.log(
        `Count delta         : ${countDelta >= 0 ? "+" : ""}${countDelta}`
    );

    console.log(
        `Availability safe   : ${
            safety.availabilitySafe
                ? "YES"
                : "NO"
        }`
    );

    console.log(
        `Confirmed missing   : ${availability.confirmedMissingIds.length}`
    );

    console.log(
        `Missing threshold   : ${MISSING_CONFIRMATION_RUNS}`
    );

    console.log("");
    console.log(
        `Products file: ${linksFile}`
    );

    console.log(
        `Report file   : ${reportFile}`
    );

    console.log(
        `History file  : ${historyFile}`
    );

    /*
    -----------------------------------------------------
    Show sample
    -----------------------------------------------------
    */

    console.log("");
    console.log(
        "First discovered products:"
    );

    discovery.products
        .slice(0, 10)
        .forEach(
            (product, index) => {
                console.log(
                    `${index + 1}. [${product.id}] ${product.href}`
                );
            }
        );

    console.log("");

    /*
    -----------------------------------------------------
    Close browser
    -----------------------------------------------------
    */

    await browser.close();

    process.exit(0);

} catch (error) {
    /*
    =====================================================
    ERROR HANDLING
    =====================================================
    */

    console.error("");
    console.error(
        "=============================================="
    );

    console.error(
        "          ❌ DISCOVERY FAILED"
    );

    console.error(
        "=============================================="
    );

    console.error("");

    console.error(
        error?.message ||
        error
    );

    console.error("");

    /*
    -----------------------------------------------------
    Try to save browser screenshot if possible.
    -----------------------------------------------------
    */

    try {
        /*
        page is scoped inside try, so this section
        intentionally does not assume it exists.
        */
    } catch {}

    /*
    -----------------------------------------------------
    IMPORTANT:
    Do NOT create an empty product-links.json.
    Do NOT overwrite history with an empty discovery.
    Do NOT mark products unavailable here.
    -----------------------------------------------------
    */

    console.error(
        "🛑 Existing product availability was NOT modified."
    );

    console.error(
        "🛑 No products were deleted."
    );

    console.error("");

    process.exit(1);
}
