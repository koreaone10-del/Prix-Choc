import { chromium } from "playwright";
import fs from "fs";
import path from "path";

import { config } from "./config.js";

const debugDir = path.resolve("./debug");

fs.mkdirSync(debugDir, {
    recursive: true
});

function cleanText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function makePageUrl(baseUrl, pageNumber) {
    const url = new URL(baseUrl);

    url.searchParams.set(
        "page",
        String(pageNumber)
    );

    return url.toString();
}

console.log("");
console.log("======================================");
console.log("       PRIX CHOC - SAWA9LY");
console.log("       FULL PRODUCT DISCOVERY");
console.log("======================================");
console.log("");

/*
 * التأكد من وجود بيانات الدخول
 * بدون طباعة البريد أو كلمة السر
 */

if (!config?.sawa9ly?.email) {
    console.error(
        "SAWA9LY_EMAIL غير موجود في .env"
    );
    process.exit(1);
}

if (!config?.sawa9ly?.password) {
    console.error(
        "SAWA9LY_PASSWORD غير موجود في .env"
    );
    process.exit(1);
}

console.log(
    "Login credentials detected."
);

console.log("");

console.log(
    "Launching Chromium..."
);

const browser = await chromium.launch({
    headless:
        config.automation?.headless ?? true
});

const context = await browser.newContext({
    viewport: {
        width: 1440,
        height: 900
    }
});

const page = await context.newPage();

try {

    // ==========================================
    // 1. LOGIN
    // ==========================================

    console.log("");
    console.log(
        "1) Opening Sawa9ly login..."
    );

    await page.goto(
        config.sawa9ly.loginUrl,
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    await page.waitForTimeout(2000);

    console.log(
        "Login URL:",
        page.url()
    );

    await page.screenshot({
        path: path.join(
            debugDir,
            "01-login.png"
        ),
        fullPage: true
    });

    // ==========================================
    // 2. LOGIN FIELDS
    // ==========================================

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

    console.log(
        `Email fields: ${emailCount}`
    );

    console.log(
        `Password fields: ${passwordCount}`
    );

    if (
        emailCount === 0 ||
        passwordCount === 0
    ) {
        throw new Error(
            "لم يتم العثور على حقول تسجيل الدخول."
        );
    }

    // ==========================================
    // 3. ENTER LOGIN
    // ==========================================

    console.log("");
    console.log(
        "2) Entering login credentials..."
    );

    await emailInput.fill(
        config.sawa9ly.email
    );

    await passwordInput.fill(
        config.sawa9ly.password
    );

    // ==========================================
    // 4. SUBMIT
    // ==========================================

    const submitButton =
        page.locator(
            'button[type="submit"]'
        ).first();

    if (
        await submitButton.count() > 0
    ) {

        console.log(
            "Submit button found."
        );

        await submitButton.click();

    } else {

        console.log(
            "Submit button not found."
        );

        console.log(
            "Pressing Enter..."
        );

        await passwordInput.press(
            "Enter"
        );
    }

    // ==========================================
    // 5. WAIT FOR LOGIN
    // ==========================================

    console.log("");
    console.log(
        "Waiting for login..."
    );

    await page.waitForTimeout(5000);

    console.log(
        "After login URL:",
        page.url()
    );

    await page.screenshot({
        path: path.join(
            debugDir,
            "02-after-login.png"
        ),
        fullPage: true
    });

    if (
        /\/login/i.test(
            page.url()
        )
    ) {

        throw new Error(
            "لم ينجح تسجيل الدخول إلى Sawa9ly."
        );
    }

    console.log(
        "Login successful."
    );

    // ==========================================
    // 6. OPEN DASHBOARD PAGE 1
    // ==========================================

    console.log("");
    console.log(
        "3) Opening Sawa9ly dashboard..."
    );

    const firstDashboardUrl =
        makePageUrl(
            config.sawa9ly.dashboardUrl,
            1
        );

    await page.goto(
        firstDashboardUrl,
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    await page.waitForTimeout(3000);

    console.log(
        "Dashboard:",
        page.url()
    );

    await page.screenshot({
        path: path.join(
            debugDir,
            "03-dashboard.png"
        ),
        fullPage: true
    });

    const dashboardHtml =
        await page.content();

    fs.writeFileSync(
        path.join(
            debugDir,
            "dashboard.html"
        ),
        dashboardHtml,
        "utf8"
    );

    // ==========================================
    // 7. DISCOVER PAGINATION
    // ==========================================

    console.log("");
    console.log(
        "4) Detecting pagination..."
    );

    const paginationLinks =
        await page
            .locator("a")
            .evaluateAll(
                anchors =>
                    anchors
                        .map(
                            anchor => ({
                                text:
                                    String(
                                        anchor.innerText || ""
                                    )
                                        .replace(
                                            /\s+/g,
                                            " "
                                        )
                                        .trim(),

                                href:
                                    anchor.href
                            })
                        )
                        .filter(
                            item =>
                                item.href &&
                                /[?&]page=\d+/i.test(
                                    item.href
                                )
                        )
            );

    const detectedPages = [
        ...new Set(
            paginationLinks
                .map(item => {
                    try {
                        const url =
                            new URL(
                                item.href
                            );

                        const value =
                            url.searchParams.get(
                                "page"
                            );

                        return Number(value);
                    } catch {
                        return null;
                    }
                })
                .filter(
                    number =>
                        Number.isInteger(
                            number
                        ) &&
                        number > 0
                )
        )
    ].sort(
        (a, b) => a - b
    );

    console.log(
        "Detected pagination pages:",
        detectedPages.length
            ? detectedPages.join(", ")
            : "none"
    );

    let maxPage =
        detectedPages.length
            ? Math.max(
                ...detectedPages
            )
            : 1;

    /*
     * Safety limit.
     * We never blindly crawl thousands of pages.
     */

    const MAX_PAGES = 100;

    if (
        maxPage > MAX_PAGES
    ) {
        maxPage = MAX_PAGES;
    }

    console.log(
        "Pages to scan:",
        maxPage
    );

    // ==========================================
    // 8. COLLECT PRODUCTS FROM ALL PAGES
    // ==========================================

    console.log("");
    console.log(
        "5) Collecting product links..."
    );

    const allProductLinks = new Map();

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

        console.log(
            pageUrl
        );

        try {

            await page.goto(
                pageUrl,
                {
                    waitUntil:
                        "domcontentloaded",
                    timeout: 60000
                }
            );

            await page.waitForTimeout(
                1800
            );

            /*
             * Make sure the page is authenticated.
             */

            if (
                /\/login/i.test(
                    page.url()
                )
            ) {
                throw new Error(
                    "Session expired / redirected to login."
                );
            }

            /*
             * Extract every anchor on this page.
             */

            const pageLinks =
                await page
                    .locator("a")
                    .evaluateAll(
                        anchors =>
                            anchors.map(
                                anchor => ({
                                    text:
                                        String(
                                            anchor.innerText ||
                                            ""
                                        )
                                            .replace(
                                                /\s+/g,
                                                " "
                                            )
                                            .trim(),

                                    href:
                                        anchor.href
                                })
                            )
                    );

            /*
             * Only product URLs.
             */

            const pageProducts =
                pageLinks.filter(
                    item =>
                        /\/product\/\d+/i.test(
                            item.href
                        )
                );

            /*
             * Remove duplicates inside page.
             */

            const uniquePageProducts = [
                ...new Map(
                    pageProducts.map(
                        item => [
                            item.href,
                            item
                        ]
                    )
                ).values()
            ];

            /*
             * Add to global collection.
             */

            for (
                const product
                of uniquePageProducts
            ) {

                allProductLinks.set(
                    product.href,
                    product
                );
            }

            console.log(
                "Products on page:",
                uniquePageProducts.length
            );

            console.log(
                "Total unique products:",
                allProductLinks.size
            );

            /*
             * Save progress after every page.
             * This protects the results if the process stops.
             */

            fs.writeFileSync(
                path.join(
                    debugDir,
                    "product-links-progress.json"
                ),
                JSON.stringify(
                    [
                        ...allProductLinks.values()
                    ],
                    null,
                    2
                ),
                "utf8"
            );

        } catch (pageError) {

            console.error(
                `ERROR ON PAGE ${pageNumber}:`,
                pageError.message
            );

            /*
             * Save the failed page screenshot.
             */

            try {

                await page.screenshot({
                    path: path.join(
                        debugDir,
                        `ERROR-page-${pageNumber}.png`
                    ),
                    fullPage: true
                });

            } catch {}

            /*
             * Stop rather than silently producing
             * incomplete catalog data.
             */

            throw pageError;
        }
    }

    // ==========================================
    // 9. FINAL PRODUCT LINKS
    // ==========================================

    const finalProductLinks = [
        ...allProductLinks.values()
    ];

    fs.writeFileSync(
        path.join(
            debugDir,
            "product-links.json"
        ),
        JSON.stringify(
            finalProductLinks,
            null,
            2
        ),
        "utf8"
    );

    // ==========================================
    // 10. ALL LINKS FROM PAGE 1
    // ==========================================

    const pageOneLinks =
    await page
        .locator("a")
        .evaluateAll(
            anchors =>
                anchors.map(
                    anchor => ({
                        text:
                            String(
                                anchor.innerText || ""
                            )
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim(),

                        href:
                            anchor.href
                    })
                )
        );

    const uniqueLinks = [
        ...new Map(
            pageOneLinks
                .filter(
                    item =>
                        item.href
                )
                .map(
                    item => [
                        item.href,
                        item
                    ]
                )
        ).values()
    ];

    fs.writeFileSync(
        path.join(
            debugDir,
            "links.json"
        ),
        JSON.stringify(
            uniqueLinks,
            null,
            2
        ),
        "utf8"
    );

    // ==========================================
    // 11. FINAL REPORT
    // ==========================================

    console.log("");
    console.log("======================================");
    console.log("       DISCOVERY COMPLETED");
    console.log("======================================");
    console.log("");

    console.log(
        "Pages scanned:",
        maxPage
    );

    console.log(
        "Unique product links found:",
        finalProductLinks.length
    );

    console.log("");

    console.log(
        "Output:"
    );

    console.log(
        "debug/product-links.json"
    );

    console.log(
        "debug/product-links-progress.json"
    );

    console.log(
        "debug/links.json"
    );

    console.log("");

    if (
        finalProductLinks.length === 0
    ) {

        console.error(
            "WARNING: No product links found."
        );

    } else {

        console.log(
            "FIRST 5 PRODUCTS:"
        );

        finalProductLinks
            .slice(0, 5)
            .forEach(
                (item, index) => {

                    console.log(
                        `${index + 1}. ${item.href}`
                    );
                }
            );
    }

    console.log("");

} catch (error) {

    console.error("");
    console.error("======================================");
    console.error("              ERROR");
    console.error("======================================");
    console.error("");

    console.error(
        error.message
    );

    console.error("");

    try {

        await page.screenshot({
            path: path.join(
                debugDir,
                "ERROR.png"
            ),
            fullPage: true
        });

        console.error(
            "Screenshot:",
            "debug/ERROR.png"
        );

    } catch {}

    await browser.close();

    process.exit(1);
}

await browser.close();
