import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { config } from "./config.js";

const debugDir = path.resolve("./debug");
fs.mkdirSync(debugDir, { recursive: true });

const linksFile = path.join(debugDir, "product-links.json");
const progressFile = path.join(debugDir, "product-links-progress.json");
const reportFile = path.join(debugDir, "discovery-report.json");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stateDir = path.join(__dirname, "state");
const historyFile = path.join(stateDir, "discovery-history.json");

const MAX_PAGES = 100;

function cleanText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function makePageUrl(baseUrl, pageNumber) {
    const url = new URL(baseUrl);
    url.searchParams.set("page", String(pageNumber));
    return url.toString();
}

function extractProductId(value) {
    const match = String(value || "").match(/\/product\/(\d+)/i);
    return match ? match[1] : "";
}

function normalizeProductUrl(value) {
    try {
        const url = new URL(value);
        url.hash = "";
        return url.toString();
    } catch {
        return "";
    }
}

function readJson(file, fallback = null) {
    try {
        if (!fs.existsSync(file)) return fallback;
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, value) {
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function removeStaleDiscoveryOutputs() {
    for (const file of [
        linksFile,
        progressFile,
        reportFile
    ]) {
        try {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch {}
    }
}

console.log("");
console.log("======================================");
console.log("       PRIX CHOC - SAWA9LY");
console.log("       FULL PRODUCT DISCOVERY");
console.log("======================================");
console.log("");

const previousReport = readJson(reportFile, null) || readJson(historyFile, null);

removeStaleDiscoveryOutputs();

if (!config?.sawa9ly?.email) {
    console.error("❌ SAWA9LY_EMAIL غير موجود في .env");
    process.exit(1);
}

if (!config?.sawa9ly?.password) {
    console.error("❌ SAWA9LY_PASSWORD غير موجود في .env");
    process.exit(1);
}

console.log("Login credentials detected.");
console.log("Launching Chromium...");

const browser = await chromium.launch({
    headless: config.automation?.headless ?? true
});

const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "ar-DZ"
});

const page = await context.newPage();

try {
    console.log("\n1) Opening Sawa9ly login...");

    await page.goto(config.sawa9ly.loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if (
        await page.locator('input[type="email"]').count() === 0 ||
        await page.locator('input[type="password"]').count() === 0
    ) {
        throw new Error("لم يتم العثور على حقول تسجيل الدخول.");
    }

    await emailInput.fill(config.sawa9ly.email);
    await passwordInput.fill(config.sawa9ly.password);

    const submitButton = page.locator('button[type="submit"]').first();

    if (await submitButton.count() > 0) {
        await submitButton.click();
    } else {
        await passwordInput.press("Enter");
    }

    await page.waitForTimeout(5000);

    if (/\/login/i.test(page.url())) {
        throw new Error("لم ينجح تسجيل الدخول إلى Sawa9ly.");
    }

    console.log("✅ Login successful.");

    console.log("\n2) Opening Sawa9ly dashboard...");

    await page.goto(makePageUrl(config.sawa9ly.dashboardUrl, 1), {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    await page.waitForTimeout(3000);

    if (/\/login/i.test(page.url())) {
        throw new Error("تمت إعادة التوجيه إلى صفحة تسجيل الدخول.");
    }

    const dashboardHtml = await page.content();
    fs.writeFileSync(path.join(debugDir, "dashboard.html"), dashboardHtml, "utf8");

    console.log("\n3) Detecting pagination...");

    const paginationLinks = await page.locator("a").evaluateAll(anchors =>
        anchors
            .map(anchor => ({
                text: String(anchor.innerText || "").replace(/\s+/g, " ").trim(),
                href: anchor.href
            }))
            .filter(item => item.href && /[?&]page=\d+/i.test(item.href))
    );

    const detectedPages = [
        ...new Set(
            paginationLinks
                .map(item => {
                    try {
                        return Number(new URL(item.href).searchParams.get("page"));
                    } catch {
                        return null;
                    }
                })
                .filter(number => Number.isInteger(number) && number > 0)
        )
    ].sort((a, b) => a - b);

    let maxPage = detectedPages.length ? Math.max(...detectedPages) : 1;
    const paginationCapped = maxPage > MAX_PAGES;

    if (paginationCapped) {
        throw new Error(
            `Pagination exceeds safety limit: ${maxPage} pages detected, maximum is ${MAX_PAGES}.`
        );
    }

    console.log(
        "Detected pagination pages:",
        detectedPages.length ? detectedPages.join(", ") : "none"
    );
    console.log("Pages to scan:", maxPage);

    console.log("\n4) Collecting product links...");

    const allProductLinks = new Map();
    const pageCounts = {};

    for (let pageNumber = 1; pageNumber <= maxPage; pageNumber++) {
        const pageUrl = makePageUrl(config.sawa9ly.dashboardUrl, pageNumber);

        console.log(`--- PAGE ${pageNumber}/${maxPage} ---`);

        await page.goto(pageUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        await page.waitForTimeout(1800);

        if (/\/login/i.test(page.url())) {
            throw new Error(`Session expired / redirected to login on page ${pageNumber}.`);
        }

        const pageLinks = await page.locator("a").evaluateAll(anchors =>
            anchors.map(anchor => ({
                text: String(anchor.innerText || "").replace(/\s+/g, " ").trim(),
                href: anchor.href
            }))
        );

        const uniquePageProducts = [
            ...new Map(
                pageLinks
                    .map(item => ({
                        ...item,
                        href: normalizeProductUrl(item.href)
                    }))
                    .filter(item => item.href && /\/product\/\d+/i.test(item.href))
                    .map(item => [extractProductId(item.href), item])
            ).values()
        ];

        pageCounts[String(pageNumber)] = uniquePageProducts.length;

        if (uniquePageProducts.length === 0) {
            throw new Error(
                `Page ${pageNumber} returned zero product links. Discovery is considered incomplete.`
            );
        }

        for (const product of uniquePageProducts) {
            allProductLinks.set(extractProductId(product.href), product);
        }

        writeJson(progressFile, [...allProductLinks.values()]);

        console.log(
            `Products on page: ${uniquePageProducts.length} | Total unique: ${allProductLinks.size}`
        );
    }

    const finalProductLinks = [...allProductLinks.values()];
    const discoveredIds = [
        ...new Set(finalProductLinks.map(item => extractProductId(item.href)).filter(Boolean))
    ];

    if (finalProductLinks.length === 0 || discoveredIds.length === 0) {
        throw new Error("Discovery completed with zero product links. Refusing to publish an empty catalog.");
    }

    const previousIds = new Set(
        Array.isArray(previousReport?.discoveredIds)
            ? previousReport.discoveredIds.map(String)
            : []
    );

    const previousStreaks =
        previousReport?.missingStreaks &&
        typeof previousReport.missingStreaks === "object"
            ? previousReport.missingStreaks
            : {};

    const currentIds = new Set(discoveredIds.map(String));
    const missingStreaks = {};
    const confirmedMissingIds = [];

    for (const id of previousIds) {
        if (!currentIds.has(id)) {
            const streak = Number(previousStreaks[id] || 0) + 1;
            missingStreaks[id] = streak;

            if (streak >= 2) {
                confirmedMissingIds.push(id);
            }
        }
    }

    const previousCount = previousIds.size;
    const currentCount = currentIds.size;

    /*
     * A discovery is eligible for availability decisions only when:
     * - every requested page completed successfully;
     * - no safety cap was hit;
     * - every scanned page contained product links;
     * - the result is non-empty.
     *
     * Missing products are still confirmed separately after two
     * consecutive successful discovery runs.
     */
    const availabilitySafe =
        !paginationCapped &&
        maxPage >= 1 &&
        Object.keys(pageCounts).length === maxPage &&
        Object.values(pageCounts).every(count => Number(count) > 0) &&
        finalProductLinks.length > 0;

    const report = {
        complete: true,
        availabilitySafe,
        pagesScanned: maxPage,
        detectedPages,
        paginationCapped,
        productsFound: finalProductLinks.length,
        discoveredIds,
        previousProductsFound: previousCount,
        countDelta: currentCount - previousCount,
        pageCounts,
        confirmedMissingIds,
        missingStreaks,
        generatedAt: new Date().toISOString()
    };

    writeJson(linksFile, finalProductLinks);
    writeJson(reportFile, report);
    writeJson(historyFile, report);

    console.log("\n======================================");
    console.log("       DISCOVERY COMPLETED");
    console.log("======================================");
    console.log(`Pages scanned: ${maxPage}`);
    console.log(`Unique product links found: ${finalProductLinks.length}`);
    console.log(`Availability safe: ${availabilitySafe ? "YES" : "NO"}`);
    console.log(`Confirmed missing after 2 scans: ${confirmedMissingIds.length}`);
    console.log("Output: debug/product-links.json");
    console.log("Report: debug/discovery-report.json");
    console.log("");

    finalProductLinks.slice(0, 5).forEach((item, index) => {
        console.log(`${index + 1}. ${item.href}`);
    });

    await browser.close();
} catch (error) {
    console.error("");
    console.error("======================================");
    console.error("              ERROR");
    console.error("======================================");
    console.error("");
    console.error(error?.message || error);
    console.error("");

    try {
        await page.screenshot({
            path: path.join(debugDir, "ERROR.png"),
            fullPage: true
        });
    } catch {}

    try {
        await browser.close();
    } catch {}

    process.exit(1);
}
