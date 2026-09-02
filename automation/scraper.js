import { chromium } from "playwright";
import fs from "fs";
import path from "path";

import {
    config,
    validateConfig
} from "./config.js";

import {
    calculateSellingPrice,
    calculateProfit
} from "./pricing.js";

validateConfig();

const outputDir =
    path.resolve("./output");

fs.mkdirSync(outputDir, {
    recursive: true
});

function cleanText(value) {
    if (!value) {
        return "";
    }

    return String(value)
        .replace(/\s+/g, " ")
        .trim();
}

function parsePrice(value) {
    if (!value) {
        return 0;
    }

    const text = String(value)
        .replace(/[^\d.,]/g, "")
        .replace(/\s/g, "");

    if (!text) {
        return 0;
    }

    const normalized =
        text.replace(/,/g, "");

    const number =
        Number(normalized);

    return Number.isFinite(number)
        ? number
        : 0;
}

function extractProductId(url) {
    const match =
        String(url).match(
            /\/product\/(\d+)/i
        );

    return match
        ? match[1]
        : "";
}

async function extractProduct(page, url) {
    console.log(
        `\n🔎 Opening: ${url}`
    );

    await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    await page.waitForTimeout(1200);

    const title =
        await page.locator("h1")
            .first()
            .textContent()
            .catch(() => "");

    const metaTitle =
        await page
            .locator(
                'meta[property="og:title"]'
            )
            .getAttribute("content")
            .catch(() => "");

    const name =
        cleanText(title) ||
        cleanText(metaTitle);

    const image =
        await page
            .locator(
                'meta[property="og:image"]'
            )
            .getAttribute("content")
            .catch(() => "");

    const canonical =
        await page
            .locator(
                'link[rel="canonical"]'
            )
            .getAttribute("href")
            .catch(() => "");

    const bodyText =
        cleanText(
            await page.locator("body")
                .innerText()
                .catch(() => "")
        );

    let basePrice = 0;

    const pricePatterns = [
        /(\d[\d\s.,]{2,})\s*(?:دج|DA|DZD)/i,
        /(?:السعر|prix)\s*[:：]?\s*(\d[\d\s.,]*)/i
    ];

    for (
        const pattern of pricePatterns
    ) {
        const match =
            bodyText.match(pattern);

        if (match) {
            basePrice =
                parsePrice(match[1]);

            if (basePrice > 0) {
                break;
            }
        }
    }

    const sourceId =
        extractProductId(url);

    const sellingPrice =
        calculateSellingPrice(
            basePrice
        );

    const profit =
        calculateProfit(
            basePrice,
            sellingPrice
        );

    return {
        sawa9lyId: sourceId,
        name,
        basePrice,
        sellingPrice,
        profit,
        image: cleanText(image),
        sawa9lyLink:
            canonical || url,
        scrapedAt:
            new Date().toISOString()
    };
}

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
        }
    });

const page =
    await context.newPage();

console.log("\n======================================");
console.log("   PRIX CHOC PRODUCT SCRAPER");
console.log("======================================\n");

await page.goto(
    config.sawa9ly.loginUrl,
    {
        waitUntil: "domcontentloaded",
        timeout: 60000
    }
);

const emailInput =
    page.locator(
        'input[type="email"]'
    ).first();

const passwordInput =
    page.locator(
        'input[type="password"]'
    ).first();

if (
    await emailInput.count() > 0 &&
    await passwordInput.count() > 0
) {
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

    await page.waitForTimeout(3000);
}

await page.goto(
    config.sawa9ly.dashboardUrl,
    {
        waitUntil: "domcontentloaded",
        timeout: 60000
    }
);

await page.waitForTimeout(2000);

const linksFile = path.resolve(
    "./debug/product-links.json"
);

if (!fs.existsSync(linksFile)) {
    console.error(
        "❌ product-links.json غير موجود."
    );

    console.error(
        "شغّل أولاً: npm run discover"
    );

    await browser.close();
    process.exit(1);
}

const discoveredLinks =
    JSON.parse(
        fs.readFileSync(
            linksFile,
            "utf8"
        )
    );

const productLinks = [
    ...new Map(
        discoveredLinks
            .map(item => {
                if (typeof item === "string") {
                    return {
                        href: item
                    };
                }

                return {
                    href: item.href
                };
            })
            .filter(
                item =>
                    item.href &&
                    /\/product\/\d+/i.test(
                        item.href
                    )
            )
            .map(
                item => [
                    item.href,
                    item
                ]
            )
    ).values()
];

const limitedLinks =
    productLinks.slice(
        0,
        config.automation.scrapeLimit
    );

console.log(
    `🔗 Discovered product links: ${productLinks.length}`
);

console.log(
    `🛍️ Products selected for scraping: ${limitedLinks.length}`
);

console.log(
    `🛍️ Products selected: ${limitedLinks.length}`
);

const products = [];

for (
    const item of limitedLinks
) {
    try {
        const product =
            await extractProduct(
                page,
                item.href
            );

        products.push(product);

        console.log(
            `✅ ${product.sawa9lyId} | ${product.name} | ${product.basePrice} DA`
        );
    } catch (error) {
        console.error(
            `❌ Failed: ${item.href}`
        );

        console.error(
            error.message
        );
    }
}

const outputFile =
    path.join(
        outputDir,
        "products.raw.json"
    );

fs.writeFileSync(
    outputFile,
    JSON.stringify(
        products,
        null,
        2
    ),
    "utf8"
);

console.log("\n======================================");

console.log(
    `✅ Saved ${products.length} products`
);

console.log(
    `📄 ${outputFile}`
);

console.log("======================================\n");

await browser.close();
