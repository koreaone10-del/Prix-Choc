import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";

const debugDir = path.resolve("./debug");
const linksFile = path.join(debugDir, "product-links.json");
const progressFile = path.join(debugDir, "product-links-progress.json");
const reportFile = path.join(debugDir, "discovery-report.json");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stateDir = path.join(__dirname, "state");
const historyFile = path.join(stateDir, "discovery-history.json");

fs.mkdirSync(debugDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

const MAX_PAGES = 100;

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function makePageUrl(baseUrl, pageNumber) {
    const url = new URL(baseUrl);
    url.searchParams.set("page", String(pageNumber));
    return url.toString();
}

function extractProductId(value) {
    const match = String(value || "").match(/\/(?:store|product)\/(\d+)/i);
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
        return fs.existsSync(file)
            ? JSON.parse(fs.readFileSync(file, "utf8"))
            : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(file, value) {
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function removeStaleOutputs() {
    for (const file of [linksFile, progressFile, reportFile]) {
        try {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch {}
    }
}

removeStaleOutputs();

if (!config.sawa9ly.email || !config.sawa9ly.password) {
    console.error("❌ Sawa9ly credentials are missing.");
    process.exit(1);
}

const previousReport = readJson(reportFile, null) || readJson(historyFile, null);

console.log("======================================");
console.log(" PRIX CHOC - FULL SAWA9LY DISCOVERY");
console.log("======================================");

const browser = await chromium.launch({
    headless: config.automation.headless
});

const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "fr-DZ"
});

const page = await context.newPage();

try {
    await page.goto(config.sawa9ly.loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    await page.waitForTimeout(2000);

    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if (!(await emailInput.count()) || !(await passwordInput.count())) {
        throw new Error("لم يتم العثور على حقول تسجيل الدخول.");
    }

    await emailInput.fill(config.sawa9ly.email);
    await passwordInput.fill(config.sawa9ly.password);

    const submit = page.locator('button[type="submit"]').first();
    if (await submit.count()) {
        await submit.click();
    } else {
        await passwordInput.press("Enter");
    }

    await page.waitForTimeout(4000);

    if (/\/login/i.test(page.url())) {
        throw new Error("فشل تسجيل الدخول إلى Sawa9ly.");
    }

    console.log(`✅ Login OK: ${page.url()}`);

    await page.goto(makePageUrl(config.sawa9ly.dashboardUrl, 1), {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });
    await page.waitForTimeout(2500);

    if (/\/login/i.test(page.url())) {
        throw new Error("تمت إعادة التوجيه إلى صفحة تسجيل الدخول.");
    }

    const paginationLinks = await page.locator("a").evaluateAll(anchors =>
        anchors
            .map(a => a.href)
            .filter(Boolean)
            .filter(href => /[?&]page=\d+/i.test(href))
    );

    const detectedPages = [
        ...new Set(
            paginationLinks
                .map(href => {
                    try {
                        return Number(new URL(href).searchParams.get("page"));
                    } catch {
                        return null;
                    }
                })
                .filter(n => Number.isInteger(n) && n > 0)
        )
    ].sort((a, b) => a - b);

    const maxPage = detectedPages.length
        ? Math.max(...detectedPages)
        : 1;

    if (maxPage > MAX_PAGES) {
        throw new Error(
            `Pagination exceeds safety limit: ${maxPage} > ${MAX_PAGES}`
        );
    }

    const allProductLinks = new Map();
    const pageCounts = {};

    for (let pageNumber = 1; pageNumber <= maxPage; pageNumber++) {
        const pageUrl = makePageUrl(
            config.sawa9ly.dashboardUrl,
            pageNumber
        );

        console.log(`--- PAGE ${pageNumber}/${maxPage} ---`);

        await page.goto(pageUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });
        await page.waitForTimeout(1500);

        if (/\/login/i.test(page.url())) {
            throw new Error(
                `Session expired on page ${pageNumber}.`
            );
        }

        const anchors = await page.locator("a").evaluateAll(as =>
            as.map(a => ({
                text: cleanText(a.innerText),
                href: a.href
            }))
        );

        const products = [
            ...new Map(
                anchors
                    .map(item => ({
                        ...item,
                        href: normalizeProductUrl(item.href)
                    }))
                    .filter(item =>
                        /\/(?:store|product)\/\d+/i.test(item.href)
                    )
                    .map(item => [
                        extractProductId(item.href),
                        {
                            ...item,
                            href: item.href.replace(
                                /\/product\/(\d+)/i,
                                "/store/$1"
                            )
                        }
                    ])
            ).values()
        ];

        pageCounts[String(pageNumber)] = products.length;

        if (!products.length) {
            throw new Error(
                `Page ${pageNumber} returned zero product links. Discovery aborted safely.`
            );
        }

        for (const product of products) {
            const id = extractProductId(product.href);
            if (id) allProductLinks.set(id, product);
        }

        writeJson(progressFile, [...allProductLinks.values()]);
        console.log(
            `Products: ${products.length} | Total unique: ${allProductLinks.size}`
        );
    }

    const finalProductLinks = [...allProductLinks.values()];
    const discoveredIds = finalProductLinks
        .map(item => extractProductId(item.href))
        .filter(Boolean);

    if (!finalProductLinks.length) {
        throw new Error(
            "Discovery returned zero products. Refusing to publish."
        );
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

            if (
                streak >=
                config.automation.missingConfirmationRuns
            ) {
                confirmedMissingIds.push(id);
            }
        }
    }

    for (const id of currentIds) {
        missingStreaks[id] = 0;
    }

    const availabilitySafe =
        finalProductLinks.length > 0 &&
        maxPage >= 1 &&
        Object.keys(pageCounts).length === maxPage &&
        Object.values(pageCounts).every(n => Number(n) > 0);

    const report = {
        complete: true,
        availabilitySafe,
        pagesScanned: maxPage,
        detectedPages,
        productsFound: finalProductLinks.length,
        discoveredIds,
        previousProductsFound: previousIds.size,
        countDelta:
            currentIds.size - previousIds.size,
        pageCounts,
        confirmedMissingIds,
        missingStreaks,
        generatedAt: new Date().toISOString()
    };

    writeJson(linksFile, finalProductLinks);
    writeJson(reportFile, report);
    writeJson(historyFile, report);

    console.log("======================================");
    console.log("DISCOVERY COMPLETED");
    console.log("======================================");
    console.log(`Pages: ${maxPage}`);
    console.log(`Products: ${finalProductLinks.length}`);
    console.log(`Availability safe: ${availabilitySafe ? "YES" : "NO"}`);
    console.log(
        `Confirmed missing: ${confirmedMissingIds.length}`
    );

    await browser.close();
} catch (error) {
    console.error("❌ DISCOVERY ERROR");
    console.error(error?.message || error);

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
