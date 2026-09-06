import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
    config,
    validateConfig,
    printConfigSummary
} from "./config.js";


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
 5. توحيد الروابط إلى:
      /store/123
 6. اكتشاف جميع المنتجات الموجودة في الكتالوج.
 7. منع اعتبار الكتالوج فارغاً بسبب خطأ مؤقت.
 8. حفظ product-links.json.
 9. حفظ discovery-report.json.
10. حفظ discovery-history.json.
11. تتبع المنتجات المختفية.
12. عدم حذف المنتجات من products.js.
13. عدم اعتبار المنتج مفقوداً إلا بعد
    عدد عمليات Discovery الناجحة المحدد.
14. حفظ progress أثناء العمل.
15. إيقاف العملية بأمان عند حدوث خلل.

 مهم:

 Discovery لا يعدّل products.js.

 هو فقط ينتج البيانات التي يستخدمها
 scraper.js و generator.js لاحقاً.
=========================================================
*/


/*
=========================================================
 PATHS
=========================================================
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const debugDir = config.paths.debugDir;

const stateDir = config.paths.stateDir;

fs.mkdirSync(
    debugDir,
    {
        recursive: true
    }
);

fs.mkdirSync(
    stateDir,
    {
        recursive: true
    }
);


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
    Number(
        config.automation.maxDiscoveryPages
    )
);

const NAVIGATION_TIMEOUT = Math.max(
    10000,
    Number(
        config.automation.navigationTimeout
    )
);

const PAGE_DELAY = Math.max(
    0,
    Number(
        config.automation.pageDelay
    )
);

const LOGIN_WAIT = Math.max(
    1000,
    Number(
        config.automation.loginWait
    )
);

const MISSING_CONFIRMATION_RUNS =
    Math.max(
        1,
        Number(
            config.automation
                .missingConfirmationRuns
        )
    );


/*
=========================================================
 HELPERS
=========================================================
*/


function cleanText(value) {
    return String(
        value ?? ""
    )
        .replace(/\s+/g, " ")
        .trim();
}


/*
---------------------------------------------------------
 Safe JSON read
---------------------------------------------------------
*/

function readJson(
    file,
    fallback = null
) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const raw =
            fs.readFileSync(
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

function writeJson(
    file,
    value
) {
    const directory =
        path.dirname(file);

    fs.mkdirSync(
        directory,
        {
            recursive: true
        }
    );

    const temporaryFile =
        `${file}.tmp`;

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
 Remove temporary discovery outputs.

 IMPORTANT:
 We do not remove history.

 Existing history must survive a failed run.
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
            if (
                fs.existsSync(file)
            ) {
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


function extractProductId(
    value
) {
    const raw =
        String(
            value ?? ""
        );

    const patterns = [
        /\/store\/(\d+)(?:[/?#]|$)/i,
        /\/product\/(\d+)(?:[/?#]|$)/i
    ];

    for (
        const pattern
        of patterns
    ) {
        const match =
            raw.match(pattern);

        if (match) {
            return String(
                match[1]
            );
        }
    }

    return "";
}


/*
---------------------------------------------------------
 Normalize product URL
---------------------------------------------------------
*/

function normalizeProductUrl(
    value
) {
    try {
        const raw =
            String(
                value ?? ""
            );

        const url =
            new URL(raw);

        const id =
            extractProductId(
                url.href
            );

        if (!id) {
            return "";
        }

        const baseUrl =
            String(
                config.sawa9ly.baseUrl
            ).replace(
                /\/+$/,
                ""
            );

        return `${baseUrl}/store/${id}`;

    } catch {
        return "";
    }
}


/*
---------------------------------------------------------
 Product URL check
---------------------------------------------------------
*/

function isProductUrl(
    value
) {
    return Boolean(
        extractProductId(
            value
        )
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
    const url =
        new URL(
            String(baseUrl)
        );

    url.searchParams.set(
        "page",
        String(pageNumber)
    );

    return url.toString();
}


/*
---------------------------------------------------------
 Extract page number
---------------------------------------------------------
*/

function extractPageNumber(
    value
) {
    try {
        const url =
            new URL(
                String(value)
            );

        const page =
            Number(
                url.searchParams.get(
                    "page"
                )
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
=========================================================
 PAGINATION
=========================================================
*/

async function detectPagination(
    page
) {
    /*
     IMPORTANT:

     Everything inside evaluateAll()
     runs in the browser.

     Therefore we NEVER call the Node.js
     cleanText() function here.

     We clean the text directly inside
     the browser context.
    */

    const links =
        await page
            .locator("a")
            .evaluateAll(
                anchors =>
                    anchors
                        .map(
                            anchor => ({
                                text:
                                    String(
                                        anchor.innerText ??
                                        ""
                                    )
                                        .replace(
                                            /\s+/g,
                                            " "
                                        )
                                        .trim(),

                                href:
                                    anchor.href || ""
                            })
                        )
                        .filter(
                            item =>
                                Boolean(
                                    item.href
                                )
                        )
            );

    const pageNumbers = [];

    for (
        const item
        of links
    ) {
        const number =
            extractPageNumber(
                item.href
            );

        if (
            Number.isInteger(number) &&
            number > 0
        ) {
            pageNumbers.push(
                number
            );
        }
    }

    const uniquePages = [
        ...new Set(
            pageNumbers
        )
    ].sort(
        (a, b) =>
            a - b
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
    /*
     Again, this function executes
     inside Chromium.

     Do not use Node.js cleanText()
     inside evaluateAll().
    */

    const anchors =
        await page
            .locator("a")
            .evaluateAll(
                elements =>
                    elements.map(
                        anchor => ({
                            text:
                                String(
                                    anchor.innerText ??
                                    ""
                                )
                                    .replace(
                                        /\s+/g,
                                        " "
                                    )
                                    .trim(),

                            href:
                                anchor.href ||
                                "",

                            title:
                                String(
                                    anchor.getAttribute(
                                        "title"
                                    ) ??
                                    ""
                                )
                                    .replace(
                                        /\s+/g,
                                        " "
                                    )
                                    .trim()
                        })
                    )
            );

    const productsById =
        new Map();

    for (
        const anchor
        of anchors
    ) {
        if (
            !anchor.href
        ) {
            continue;
        }

        if (
            !isProductUrl(
                anchor.href
            )
        ) {
            continue;
        }

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
         Prefer one canonical product
         record per Sawa9ly ID.
        */

        if (
            !productsById.has(id)
        ) {
            productsById.set(
                id,
                {
                    id,
                    href:
                        normalized,
                    text:
                        anchor.text ||
                        "",
                    title:
                        anchor.title ||
                        ""
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

async function login(
    page
) {
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
    Detect login fields
    -----------------------------------------------------
    */

    const emailSelector =
        'input[type="email"]';

    const passwordSelector =
        'input[type="password"]';

    const emailCount =
        await page
            .locator(
                emailSelector
            )
            .count();

    const passwordCount =
        await page
            .locator(
                passwordSelector
            )
            .count();


    /*
    -----------------------------------------------------
    Already authenticated
    -----------------------------------------------------
    */

    if (
        emailCount === 0 &&
        passwordCount === 0
    ) {
        await page.waitForTimeout(
            LOGIN_WAIT
        );

        const stillHasPassword =
            await page
                .locator(
                    passwordSelector
                )
                .count();

        if (
            stillHasPassword === 0
        ) {
            console.log(
                "ℹ️ Login form not displayed; current session appears authenticated."
            );

            return;
        }
    }


    /*
    -----------------------------------------------------
    Login form required
    -----------------------------------------------------
    */

    const finalEmailCount =
        await page
            .locator(
                emailSelector
            )
            .count();

    const finalPasswordCount =
        await page
            .locator(
                passwordSelector
            )
            .count();

    if (
        finalEmailCount === 0 ||
        finalPasswordCount === 0
    ) {
        throw new Error(
            "لم يتم العثور على حقول تسجيل الدخول في Sawa9ly Affiliate."
        );
    }


    if (
        !config.sawa9ly.email ||
        !config.sawa9ly.password
    ) {
        throw new Error(
            "بيانات تسجيل الدخول إلى Sawa9ly غير موجودة."
        );
    }


    console.log(
        "Login form detected."
    );


    const emailInput =
        page
            .locator(
                emailSelector
            )
            .first();

    const passwordInput =
        page
            .locator(
                passwordSelector
            )
            .first();


    await emailInput.fill(
        config.sawa9ly.email
    );

    await passwordInput.fill(
        config.sawa9ly.password
    );


    /*
    -----------------------------------------------------
    Submit
    -----------------------------------------------------
    */

    const submitButton =
        page
            .locator(
                'button[type="submit"]'
            )
            .first();

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
    Verify login
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

async function openCatalog(
    page
) {
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
    -----------------------------------------------------
    Save dashboard HTML
    -----------------------------------------------------
    */

    try {
        fs.writeFileSync(
            dashboardFile,
            await page.content(),
            "utf8"
        );
    } catch (error) {
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


    /*
    Page 1 must always exist.
    */

    if (
        !detectedPages.includes(1)
    ) {
        detectedPages.unshift(1);
    }


    let maxPage =
        detectedPages.length > 0
            ? Math.max(
                ...detectedPages
            )
            : 1;


    /*
    -----------------------------------------------------
    Safety limit
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
 DISCOVER PRODUCTS
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
    Scan every page
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
        ZERO PRODUCT PROTECTION
        -------------------------------------------------

        A single empty page is considered
        a failed discovery.

        We NEVER use it to mark products
        unavailable.
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

        for (
            const product
            of products
        ) {
            allProducts.set(
                String(
                    product.id
                ),
                product
            );
        }


        /*
        -------------------------------------------------
        Save progress
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


    /*
    -----------------------------------------------------
    Previous IDs
    -----------------------------------------------------
    */

    const previousIds =
        new Set(
            Array.isArray(
                previousHistory?.discoveredIds
            )
                ? previousHistory
                    .discoveredIds
                    .map(
                        value =>
                            String(value)
                    )
                    .filter(Boolean)
                : []
        );


    /*
    -----------------------------------------------------
    Previous missing streaks
    -----------------------------------------------------
    */

    const previousStreaks =
        (
            previousHistory?.missingStreaks &&
            typeof
                previousHistory.missingStreaks ===
                "object"
        )
            ? previousHistory.missingStreaks
            : {};


    /*
    -----------------------------------------------------
    Current IDs
    -----------------------------------------------------
    */

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


    const missingStreaks = {};

    const confirmedMissingIds = [];


    /*
    -----------------------------------------------------
    Present products
    -----------------------------------------------------

    Present = 0 missing runs.
    */

    for (
        const id
        of currentIds
    ) {
        missingStreaks[id] = 0;
    }


    /*
    -----------------------------------------------------
    Missing products
    -----------------------------------------------------
    */

    for (
        const id
        of previousIds
    ) {
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
 DISCOVERY SAFETY
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
        Array.isArray(products) &&
        products.length > 0;


    const withinSafetyLimit =
        maxPage <=
        MAX_PAGES;


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
 BROWSER SETUP
=========================================================
*/

async function createBrowserContext(
    browser
) {
    const browserConfig =
        config.browser || {};


    const viewport =
        browserConfig.viewport || {
            width: 1440,
            height: 900
        };


    const context =
        await browser.newContext({
            viewport,

            locale:
                browserConfig.locale ||
                "ar-DZ",

            timezoneId:
                browserConfig.timezoneId ||
                "Africa/Algiers",

            userAgent:
                browserConfig.userAgent ||
                undefined
        });


    return context;
}


/*
=========================================================
 MAIN
=========================================================
*/

async function main() {
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


    /*
    -----------------------------------------------------
    Validate configuration
    -----------------------------------------------------
    */

    validateConfig();

    printConfigSummary();


    /*
    -----------------------------------------------------
    Remove stale temporary outputs.
    -----------------------------------------------------
    */

    removeStaleDiscoveryOutputs();


    /*
    -----------------------------------------------------
    Verify credentials
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


    let context = null;

    try {
        context =
            await createBrowserContext(
                browser
            );


        const page =
            await context.newPage();


        page.setDefaultNavigationTimeout(
            NAVIGATION_TIMEOUT
        );


        /*
        -------------------------------------------------
        LOGIN
        -------------------------------------------------
        */

        await login(
            page
        );


        /*
        -------------------------------------------------
        OPEN CATALOG
        -------------------------------------------------
        */

        await openCatalog(
            page
        );


        /*
        -------------------------------------------------
        DETECT PAGINATION
        -------------------------------------------------
        */

        const pagination =
            await discoverPageCount(
                page
            );


        /*
        -------------------------------------------------
        DISCOVER PRODUCTS
        -------------------------------------------------
        */

        const discovery =
            await discoverProducts(
                page,
                pagination.maxPage
            );


        /*
        -------------------------------------------------
        SAFETY
        -------------------------------------------------
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
        -------------------------------------------------
        AVAILABILITY HISTORY
        -------------------------------------------------
        */

        const availability =
            buildAvailabilityState(
                discovery.products
            );


        /*
        -------------------------------------------------
        BUILD IDS
        -------------------------------------------------
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


        const uniqueDiscoveredIds =
            [
                ...new Set(
                    discoveredIds
                )
            ];


        if (
            uniqueDiscoveredIds.length === 0
        ) {
            throw new Error(
                "No valid product IDs were discovered."
            );
        }


        /*
        -------------------------------------------------
        COUNTS
        -------------------------------------------------
        */

        const previousCount =
            availability
                .previousIds
                .length;


        const currentCount =
            uniqueDiscoveredIds.length;


        const countDelta =
            currentCount -
            previousCount;


        /*
        -------------------------------------------------
        REPORT
        -------------------------------------------------
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
        -------------------------------------------------
        IMPORTANT SAFETY RULE
        -------------------------------------------------

        Discovery itself never modifies products.js.

        Even if availabilitySafe is false,
        the discovered data is saved for diagnostics,
        but downstream code must not trust
        missing products.
        -------------------------------------------------
        */

        if (
            !safety.availabilitySafe
        ) {
            console.warn("");

            console.warn(
                "⚠️ DISCOVERY IS NOT AVAILABILITY-SAFE."
            );

            console.warn(
                "⚠️ Availability changes must NOT be trusted."
            );

            console.warn("");
        }


        /*
        -------------------------------------------------
        SAVE product-links.json
        -------------------------------------------------
        */

        writeJson(
            linksFile,
            discovery.products
        );


        /*
        -------------------------------------------------
        SAVE discovery-report.json
        -------------------------------------------------
        */

        writeJson(
            reportFile,
            report
        );


        /*
        -------------------------------------------------
        SAVE discovery-history.json
        -------------------------------------------------
        */

        writeJson(
            historyFile,
            report
        );


        /*
        -------------------------------------------------
        SUCCESS OUTPUT
        -------------------------------------------------
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
            `Count delta         : ${
                countDelta >= 0
                    ? "+"
                    : ""
            }${countDelta}`
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
        -------------------------------------------------
        SAMPLE
        -------------------------------------------------
        */

        console.log("");

        console.log(
            "First discovered products:"
        );


        discovery.products
            .slice(0, 10)
            .forEach(
                (
                    product,
                    index
                ) => {
                    console.log(
                        `${index + 1}. [${product.id}] ${product.href}`
                    );
                }
            );


        console.log("");


        /*
        -------------------------------------------------
        CLOSE
        -------------------------------------------------
        */

        await context.close();

        context = null;

        await browser.close();


        return {
            success:
                true,

            report
        };

    } catch (error) {
        /*
        -------------------------------------------------
        Close context safely
        -------------------------------------------------
        */

        try {
            if (context) {
                await context.close();
            }
        } catch {}


        throw error;

    } finally {
        /*
        -------------------------------------------------
        Browser cleanup
        -------------------------------------------------
        */

        try {
            await browser.close();
        } catch {}
    }
}


/*
=========================================================
 START
=========================================================
*/

main()
    .then(
        () => {
            process.exit(0);
        }
    )
    .catch(
        error => {
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
                error?.stack ||
                error?.message ||
                error
            );

            console.error("");

            console.error(
                "🛑 Existing product availability was NOT modified."
            );

            console.error(
                "🛑 No products were deleted."
            );

            console.error("");

            process.exit(1);
        }
    );
