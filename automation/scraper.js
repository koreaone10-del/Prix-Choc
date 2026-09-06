import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config, validateConfig } from "./config.js";
import {
    calculateSellingPrice,
    calculateProfit
} from "./pricing.js";

validateConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = config.paths.outputDir;
const debugDir = path.join(__dirname, "debug");
const linksFile = path.join(debugDir, "product-links.json");
const reportFile = path.join(debugDir, "discovery-report.json");

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(debugDir, { recursive: true });

function cleanText(value) {
    return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeUrl(value, base) {
    if (!value) return "";
    try {
        return new URL(String(value).trim(), base).href;
    } catch {
        return "";
    }
}

function productIdFromUrl(value) {
    const match = String(value || "").match(
        /\/(?:store|product)\/(\d+)/i
    );
    return match ? match[1] : "";
}

function parsePrice(value) {
    if (!value) return 0;

    const text = String(value)
        .replace(/[^\d.,\s]/g, "")
        .replace(/\s+/g, "");

    if (!text) return 0;

    const normalized =
        text.includes(",") && text.includes(".")
            ? text.replace(/[.,]/g, "")
            : text.replace(/[.,]/g, "");

    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
}

async function extractImages(page) {
    const result = await page.evaluate(() => {
        const out = [];

        const add = value => {
            if (!value) return;
            const src = String(value).trim();

            if (
                !src ||
                src.startsWith("data:") ||
                out.includes(src)
            ) return;

            const lower = src.toLowerCase();

            if (
                lower.includes("logo") ||
                lower.includes("favicon") ||
                lower.includes("avatar") ||
                lower.includes("icon") ||
                lower.includes("placeholder")
            ) return;

            out.push(src);
        };

        const addImg = img => {
            if (!img) return;

            for (const attr of [
                "src",
                "data-src",
                "data-lazy-src",
                "data-original",
                "data-image"
            ]) {
                add(img.getAttribute(attr));
            }

            const srcset = img.getAttribute("srcset");
            if (srcset) {
                for (const part of srcset.split(",")) {
                    add(part.trim().split(/\s+/)[0]);
                }
            }
        };

        const selectors = [
            '[class*="product"] img',
            '[class*="Product"] img',
            '[class*="gallery"] img',
            '[class*="Gallery"] img',
            '[class*="swiper"] img',
            '[class*="Swiper"] img',
            '[class*="carousel"] img',
            '[class*="Carousel"] img',
            '[class*="slider"] img',
            '[class*="Slider"] img',
            '[class*="thumb"] img',
            '[class*="Thumb"] img',
            '[class*="thumbnail"] img',
            '[data-thumbnail] img',
            "main img",
            "article img"
        ];

        for (const selector of selectors) {
            for (const img of document.querySelectorAll(selector)) {
                addImg(img);
            }
        }

        for (const link of document.querySelectorAll("a[href]")) {
            const href = link.getAttribute("href") || "";
            if (/\.(jpe?g|png|webp|avif)(\?|#|$)/i.test(href)) {
                add(href);
            }
        }

        for (const script of document.querySelectorAll(
            'script[type="application/ld+json"]'
        )) {
            try {
                const data = JSON.parse(script.textContent || "");
                const objects = Array.isArray(data) ? data : [data];

                for (const item of objects) {
                    if (!item?.image) continue;

                    if (typeof item.image === "string") {
                        add(item.image);
                    } else if (Array.isArray(item.image)) {
                        for (const image of item.image) {
                            add(
                                typeof image === "string"
                                    ? image
                                    : image?.url
                            );
                        }
                    } else {
                        add(item.image?.url);
                    }
                }
            } catch {}
        }

        add(
            document.querySelector(
                'meta[property="og:image"]'
            )?.content
        );

        add(
            document.querySelector(
                'meta[name="twitter:image"]'
            )?.content
        );

        if (!out.length) {
            for (const img of document.querySelectorAll("img")) {
                addImg(img);
            }
        }

        return out;
    });

    const images = [
        ...new Set(
            result
                .map(url => normalizeUrl(url, page.url()))
                .filter(Boolean)
        )
    ];

    return {
        image: images[0] || "",
        images
    };
}

async function extractName(page) {
    const result = await page.evaluate(() => {
        const clean = value =>
            String(value || "")
                .replace(/\u00a0/g, " ")
                .replace(/\s+/g, " ")
                .trim();

        const reject = value => {
            const text = clean(value);
            if (!text || text.length < 3 || text.length > 500) {
                return true;
            }

            return [
                "login",
                "register",
                "add to cart",
                "buy now",
                "commander maintenant",
                "ajouter au panier",
                "description",
                "الوصف",
                "تسجيل الدخول"
            ].includes(text.toLowerCase());
        };

        const candidates = [
            document.querySelector("h1")?.innerText,
            document.querySelector(
                'meta[property="og:title"]'
            )?.content,
            document.querySelector(
                'meta[name="twitter:title"]'
            )?.content
        ];

        for (const candidate of candidates) {
            if (!reject(candidate)) return clean(candidate);
        }

        for (const selector of [
            '[class*="product-title"]',
            '[class*="Product-title"]',
            '[class*="product-name"]',
            '[class*="Product-name"]',
            '[class*="title"]'
        ]) {
            for (const el of document.querySelectorAll(selector)) {
                const text = clean(el.innerText);
                if (!reject(text) && text.length <= 250) {
                    return text;
                }
            }
        }

        return "";
    });

    return cleanText(result);
}

async function extractDescription(page, name) {
    const result = await page.evaluate(productName => {
        const clean = value =>
            String(value || "")
                .replace(/\u00a0/g, " ")
                .replace(/\s+/g, " ")
                .trim();

        const candidates = [
            document.querySelector(
                'meta[name="description"]'
            )?.content,
            document.querySelector(
                'meta[property="og:description"]'
            )?.content
        ];

        for (const text of candidates) {
            const value = clean(text);
            if (
                value &&
                value.length > 20 &&
                value.toLowerCase() !==
                    String(productName || "").toLowerCase()
            ) {
                return value;
            }
        }

        for (const selector of [
            '[class*="description"]',
            '[class*="Description"]',
            '[class*="details"]',
            '[class*="Details"]'
        ]) {
            for (const el of document.querySelectorAll(selector)) {
                const value = clean(el.innerText);
                if (
                    value &&
                    value.length > 20 &&
                    value.length < 5000
                ) {
                    return value;
                }
            }
        }

        return "";
    }, name);

    return cleanText(result);
}

async function extractBasePrice(page) {
    const values = await page.evaluate(() => {
        const out = [];

        const add = value => {
            if (value) out.push(String(value));
        };

        for (const el of document.querySelectorAll(
            '[class*="price"], [class*="Price"], [data-price]'
        )) {
            add(el.innerText);
            add(el.getAttribute("data-price"));
        }

        for (const script of document.querySelectorAll(
            'script[type="application/ld+json"]'
        )) {
            try {
                const data = JSON.parse(script.textContent || "");
                const objects = Array.isArray(data) ? data : [data];

                for (const item of objects) {
                    if (item?.offers?.price) {
                        add(item.offers.price);
                    }
                    if (item?.price) add(item.price);
                }
            } catch {}
        }

        add(document.body?.innerText || "");
        return out;
    });

    for (const value of values) {
        const text = String(value);
        const patterns = [
            /(\d[\d\s.,]{2,})\s*(?:دج|DA|DZD)/i,
            /(?:السعر|prix|price)\s*[:：]?\s*(\d[\d\s.,]*)/i
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const price = parsePrice(match[1]);
                if (price > 0) return price;
            }
        }
    }

    return 0;
}

async function extractCanonical(page, fallback) {
    const canonical = await page.locator(
        'link[rel="canonical"]'
    ).getAttribute("href").catch(() => null);

    const normalized = normalizeUrl(canonical, page.url());
    if (normalized && productIdFromUrl(normalized)) {
        return normalized.replace(
            /\/product\/(\d+)/i,
            "/store/$1"
        );
    }

    const id = productIdFromUrl(page.url());
    return id
        ? `https://affiliate.sawa9ly.pro/store/${id}`
        : fallback;
}

async function extractProduct(page, url) {
    await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000
    });

    await page.waitForTimeout(1200);

    if (/\/login/i.test(page.url())) {
        throw new Error("Session expired while scraping.");
    }

    if (
        /page not found|not found|404/i.test(
            cleanText(await page.locator("body").innerText())
        )
    ) {
        throw new Error("Sawa9ly returned a Not Found page.");
    }

    const sawa9lyId = productIdFromUrl(page.url()) ||
        productIdFromUrl(url);

    if (!sawa9lyId) {
        throw new Error("Could not determine Sawa9ly product ID.");
    }

    const name = await extractName(page);
    const imageData = await extractImages(page);
    const description = await extractDescription(page, name);
    const basePrice = await extractBasePrice(page);

    if (!name || !basePrice || !imageData.image) {
        throw new Error(
            `Incomplete product: id=${sawa9lyId}, name=${Boolean(name)}, price=${basePrice}, image=${Boolean(imageData.image)}`
        );
    }

    const sellingPrice = calculateSellingPrice(basePrice);
    const profit = calculateProfit(
        basePrice,
        sellingPrice
    );

    const sawa9lyLink = await extractCanonical(page, url);

    return {
        sawa9lyId,
        name,
        description,
        basePrice,
        sellingPrice,
        profit,
        image: imageData.image,
        images: imageData.images,
        sawa9lyLink,
        scrapedAt: new Date().toISOString()
    };
}

if (!fs.existsSync(linksFile)) {
    console.error("❌ product-links.json غير موجود.");
    process.exit(1);
}

const discoveredLinks = JSON.parse(
    fs.readFileSync(linksFile, "utf8")
);

if (!Array.isArray(discoveredLinks) || !discoveredLinks.length) {
    console.error("❌ لا توجد روابط منتجات.");
    process.exit(1);
}

const discoveryReport = fs.existsSync(reportFile)
    ? JSON.parse(fs.readFileSync(reportFile, "utf8"))
    : null;

if (
    !discoveryReport?.complete ||
    !discoveryReport?.availabilitySafe
) {
    console.error(
        "🛑 Discovery غير آمن. لن يبدأ scraping/publishing."
    );
    process.exit(1);
}

const productLinks = [
    ...new Map(
        discoveredLinks
            .map(item => ({
                href:
                    typeof item === "string"
                        ? item
                        : item?.href
            }))
            .map(item => ({
                ...item,
                href: String(item.href || "").replace(
                    /\/product\/(\d+)/i,
                    "/store/$1"
                )
            }))
            .filter(item =>
                /\/store\/\d+/i.test(item.href)
            )
            .map(item => [
                productIdFromUrl(item.href),
                item
            ])
    ).values()
];

const limit = Math.min(
    config.automation.scrapeLimit,
    productLinks.length
);

const selectedLinks = productLinks.slice(0, limit);

console.log("======================================");
console.log(" PRIX CHOC - FULL PRODUCT SCRAPER");
console.log("======================================");
console.log(`Discovered: ${productLinks.length}`);
console.log(`Selected:   ${selectedLinks.length}`);
console.log(`Concurrency: ${config.automation.scrapeConcurrency}`);

const browser = await chromium.launch({
    headless: config.automation.headless
});

const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "fr-DZ"
});

const workerCount = Math.min(
    config.automation.scrapeConcurrency,
    selectedLinks.length
);

const pages = [];
for (let i = 0; i < workerCount; i++) {
    pages.push(await context.newPage());
}

const products = [];
const failed = [];
let nextIndex = 0;

async function worker(page, workerNumber) {
    while (true) {
        const index = nextIndex++;
        if (index >= selectedLinks.length) break;

        const item = selectedLinks[index];
        const position = index + 1;

        try {
            const product = await extractProduct(
                page,
                item.href
            );

            products.push(product);

            console.log(
                `✅ ${position}/${selectedLinks.length} | ${product.sawa9lyId} | ${product.basePrice} DA | ${product.images.length} images`
            );
        } catch (error) {
            failed.push({
                href: item.href,
                sawa9lyId: productIdFromUrl(item.href),
                error: error?.message || String(error)
            });

            console.error(
                `❌ Worker ${workerNumber} | ${position}/${selectedLinks.length} | ${item.href}`
            );
            console.error(error?.message || error);
        }
    }
}

await Promise.all(
    pages.map((page, index) => worker(page, index + 1))
);

const outputFile = path.join(
    outputDir,
    "products.raw.json"
);

fs.writeFileSync(
    outputFile,
    JSON.stringify(products, null, 2),
    "utf8"
);

const debugOutput = path.join(
    debugDir,
    "scraper-debug.json"
);

const scrapeReport = {
    generatedAt: new Date().toISOString(),
    discovered: productLinks.length,
    selected: selectedLinks.length,
    scraped: products.length,
    failed: failed.length,
    coverage:
        selectedLinks.length > 0
            ? Number(
                  (
                      products.length /
                      selectedLinks.length
                  ).toFixed(4)
              )
            : 0,
    validNames: products.filter(p => Boolean(p.name)).length,
    validImages: products.filter(p => Boolean(p.image)).length,
    totalImages: products.reduce(
        (sum, p) =>
            sum +
            (Array.isArray(p.images)
                ? p.images.length
                : 0),
        0
    ),
    validPrices: products.filter(
        p => Number(p.basePrice) > 0
    ).length,
    failedProducts: failed
};

fs.writeFileSync(
    debugOutput,
    JSON.stringify(scrapeReport, null, 2),
    "utf8"
);

console.log("======================================");
console.log(`Scraped: ${products.length}/${selectedLinks.length}`);
console.log(`Failed: ${failed.length}`);
console.log(`Output: ${outputFile}`);
console.log("======================================");

await browser.close();

if (!products.length) {
    console.error(
        "❌ Zero products scraped. Refusing to publish."
    );
    process.exit(1);
}
