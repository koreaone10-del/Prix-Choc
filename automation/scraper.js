import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
    config,
    validateConfig
} from "./config.js";

import {
    calculateSellingPrice,
    calculateProfit
} from "./pricing.js";


/* =========================================================
   PATHS
========================================================= */

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


/* =========================================================
   CONFIGURATION
========================================================= */

validateConfig();

const outputDir =
    config.paths.outputDir;

const debugDir =
    path.join(
        __dirname,
        "debug"
    );

const linksFile =
    path.join(
        debugDir,
        "product-links.json"
    );


/* =========================================================
   CREATE DIRECTORIES
========================================================= */

fs.mkdirSync(
    outputDir,
    {
        recursive: true
    }
);

fs.mkdirSync(
    debugDir,
    {
        recursive: true
    }
);


/* =========================================================
   HELPERS
========================================================= */

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

    const text =
        String(value)
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


function normalizeImageUrl(
    imageUrl,
    pageUrl
) {
    if (!imageUrl) {
        return "";
    }

    const value =
        String(imageUrl).trim();

    if (!value) {
        return "";
    }

    try {
        return new URL(
            value,
            pageUrl
        ).href;
    } catch {
        return value;
    }
}


/* =========================================================
   EXTRACT PRODUCT IMAGE
========================================================= */

async function extractProductImage(
    page
) {
    /*
       Try several image sources.

       Priority:
       1. og:image
       2. twitter:image
       3. JSON-LD image
       4. main product image
       5. first useful large image
    */

    const image =
        await page.evaluate(() => {

            function clean(value) {
                if (!value) {
                    return "";
                }

                return String(value).trim();
            }


            /* -------------------------
               OG IMAGE
            ------------------------- */

            const ogImage =
                document.querySelector(
                    'meta[property="og:image"]'
                );

            if (
                ogImage?.content
            ) {
                return clean(
                    ogImage.content
                );
            }


            /* -------------------------
               TWITTER IMAGE
            ------------------------- */

            const twitterImage =
                document.querySelector(
                    'meta[name="twitter:image"]'
                );

            if (
                twitterImage?.content
            ) {
                return clean(
                    twitterImage.content
                );
            }


            /* -------------------------
               JSON-LD
            ------------------------- */

            const scripts =
                Array.from(
                    document.querySelectorAll(
                        'script[type="application/ld+json"]'
                    )
                );

            for (
                const script
                of scripts
            ) {
                try {
                    const data =
                        JSON.parse(
                            script.textContent ||
                            ""
                        );

                    const objects =
                        Array.isArray(data)
                            ? data
                            : [data];

                    for (
                        const item
                        of objects
                    ) {
                        if (
                            item &&
                            item.image
                        ) {
                            if (
                                typeof item.image ===
                                "string"
                            ) {
                                return clean(
                                    item.image
                                );
                            }

                            if (
                                Array.isArray(
                                    item.image
                                ) &&
                                item.image.length
                            ) {
                                return clean(
                                    item.image[0]
                                );
                            }

                            if (
                                typeof item.image ===
                                "object" &&
                                item.image.url
                            ) {
                                return clean(
                                    item.image.url
                                );
                            }
                        }
                    }
                } catch {
                    /* Ignore invalid JSON-LD */
                }
            }


            /* -------------------------
               PRODUCT IMAGE SELECTORS
            ------------------------- */

            const selectors = [
                '[class*="product"] img',
                '[class*="Product"] img',
                '[class*="gallery"] img',
                '[class*="Gallery"] img',
                'main img',
                'article img'
            ];

            for (
                const selector
                of selectors
            ) {
                const images =
                    Array.from(
                        document.querySelectorAll(
                            selector
                        )
                    );

                for (
                    const img
                    of images
                ) {
                    const src =
                        img.getAttribute(
                            "src"
                        ) ||
                        img.getAttribute(
                            "data-src"
                        ) ||
                        img.getAttribute(
                            "data-lazy-src"
                        ) ||
                        img.getAttribute(
                            "data-original"
                        );

                    if (
                        src &&
                        !src.startsWith(
                            "data:"
                        )
                    ) {
                        return clean(
                            src
                        );
                    }
                }
            }


            /* -------------------------
               ANY USEFUL IMAGE
            ------------------------- */

            const allImages =
                Array.from(
                    document.querySelectorAll(
                        "img"
                    )
                );

            for (
                const img
                of allImages
            ) {
                const src =
                    img.getAttribute(
                        "src"
                    ) ||
                    img.getAttribute(
                        "data-src"
                    ) ||
                    img.getAttribute(
                        "data-lazy-src"
                    ) ||
                    img.getAttribute(
                        "data-original"
                    );

                if (
                    src &&
                    !src.startsWith(
                        "data:"
                    ) &&
                    !src.includes(
                        "logo"
                    ) &&
                    !src.includes(
                        "icon"
                    ) &&
                    !src.includes(
                        "avatar"
                    )
                ) {
                    return clean(
                        src
                    );
                }
            }


            return "";
        });


    return normalizeImageUrl(
        image,
        page.url()
    );
}


/* =========================================================
   EXTRACT PRODUCT DETAILS
========================================================= */

async function extractProduct(
    page,
    url
) {
    console.log(
        `\n🔎 Opening: ${url}`
    );

    await page.goto(
        url,
        {
            waitUntil:
                "domcontentloaded",
            timeout: 60000
        }
    );

    await page.waitForTimeout(
        1500
    );


    /* -------------------------
       PRODUCT NAME
    ------------------------- */

    const title =
        await page
            .locator("h1")
            .first()
            .textContent()
            .catch(
                () => ""
            );


    const metaTitle =
        await page
            .locator(
                'meta[property="og:title"]'
            )
            .getAttribute(
                "content"
            )
            .catch(
                () => ""
            );


    const name =
        cleanText(title) ||
        cleanText(metaTitle);


    /* -------------------------
       PRODUCT IMAGE
    ------------------------- */

    const image =
        await extractProductImage(
            page
        );


    if (!image) {
        console.log(
            "⚠️ Product image not found."
        );
    } else {
        console.log(
            `🖼️ Image found: ${image}`
        );
    }


    /* -------------------------
       CANONICAL URL
    ------------------------- */

    const canonical =
        await page
            .locator(
                'link[rel="canonical"]'
            )
            .getAttribute(
                "href"
            )
            .catch(
                () => ""
            );


    /* -------------------------
       BODY TEXT
    ------------------------- */

    const bodyText =
        cleanText(
            await page
                .locator("body")
                .innerText()
                .catch(
                    () => ""
                )
        );


    /* -------------------------
       BASE PRICE
    ------------------------- */

    let basePrice = 0;

    const pricePatterns = [
        /(\d[\d\s.,]{2,})\s*(?:دج|DA|DZD)/i,
        /(?:السعر|prix)\s*[:：]?\s*(\d[\d\s.,]*)/i
    ];


    for (
        const pattern
        of pricePatterns
    ) {
        const match =
            bodyText.match(
                pattern
            );

        if (match) {
            basePrice =
                parsePrice(
                    match[1]
                );

            if (
                basePrice > 0
            ) {
                break;
            }
        }
    }


    /* -------------------------
       SAWA9LY ID
    ------------------------- */

    const sourceId =
        extractProductId(
            url
        );


    /* -------------------------
       SELLING PRICE
    ------------------------- */

    const sellingPrice =
        calculateSellingPrice(
            basePrice
        );


    /* -------------------------
       PROFIT
    ------------------------- */

    const profit =
        calculateProfit(
            basePrice,
            sellingPrice
        );


    /* -------------------------
       RESULT
    ------------------------- */

    return {
        sawa9lyId:
            sourceId,

        name:
            name,

        basePrice:
            basePrice,

        sellingPrice:
            sellingPrice,

        profit:
            profit,

        image:
            cleanText(image),

        sawa9lyLink:
            canonical ||
            url,

        scrapedAt:
            new Date().toISOString()
    };
}


/* =========================================================
   LOAD DISCOVERED PRODUCT LINKS
========================================================= */

if (
    !fs.existsSync(
        linksFile
    )
) {
    console.error(
        "\n❌ product-links.json غير موجود."
    );

    console.error(
        `📄 Expected: ${linksFile}`
    );

    console.error(
        "\nشغّل أولاً:"
    );

    console.error(
        "npm run discover"
    );

    process.exit(1);
}


let discoveredLinks;

try {
    discoveredLinks =
        JSON.parse(
            fs.readFileSync(
                linksFile,
                "utf8"
            )
        );
} catch (error) {
    console.error(
        "\n❌ فشل قراءة product-links.json."
    );

    console.error(
        error.message
    );

    process.exit(1);
}


/* =========================================================
   NORMALIZE DISCOVERED LINKS
========================================================= */

if (
    !Array.isArray(
        discoveredLinks
    )
) {
    console.error(
        "\n❌ product-links.json لا يحتوي على Array."
    );

    process.exit(1);
}


const productLinks =
    [
        ...new Map(
            discoveredLinks
                .map(
                    item => {
                        if (
                            typeof item ===
                            "string"
                        ) {
                            return {
                                href:
                                    item
                            };
                        }

                        return {
                            href:
                                item?.href ||
                                ""
                        };
                    }
                )
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


console.log(
    `\n🔗 Discovered product links: ${productLinks.length}`
);


/* =========================================================
   APPLY SCRAPE LIMIT
========================================================= */

const limitedLinks =
    productLinks.slice(
        0,
        config.automation.scrapeLimit
    );


console.log(
    `🛍️ Products selected for scraping: ${limitedLinks.length}`
);


if (
    limitedLinks.length === 0
) {
    console.error(
        "\n❌ No product links available for scraping."
    );

    process.exit(1);
}


/* =========================================================
   START BROWSER
========================================================= */

const browser =
    await chromium.launch(
        {
            headless:
                config.automation.headless
        }
    );


const context =
    await browser.newContext(
        {
            viewport: {
                width: 1440,
                height: 900
            }
        }
    );


const page =
    await context.newPage();


console.log(
    "\n======================================"
);

console.log(
    "   PRIX CHOC PRODUCT SCRAPER"
);

console.log(
    "======================================\n"
);


/* =========================================================
   LOGIN
========================================================= */

console.log(
    "🔐 Opening Sawa9ly login..."
);


await page.goto(
    config.sawa9ly.loginUrl,
    {
        waitUntil:
            "domcontentloaded",
        timeout: 60000
    }
);


const emailInput =
    page
        .locator(
            'input[type="email"]'
        )
        .first();


const passwordInput =
    page
        .locator(
            'input[type="password"]'
        )
        .first();


if (
    await emailInput.count() > 0 &&
    await passwordInput.count() > 0
) {
    console.log(
        "✍️ Filling login credentials..."
    );


    await emailInput.fill(
        config.sawa9ly.email
    );


    await passwordInput.fill(
        config.sawa9ly.password
    );


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
        3000
    );


    console.log(
        "✅ Login step completed."
    );
} else {
    console.log(
        "ℹ️ Login form was not detected."
    );

    console.log(
        "The current session may already be authenticated."
    );
}


/* =========================================================
   OPEN DASHBOARD TO CONFIRM SESSION
========================================================= */

console.log(
    "\n🔐 Opening Sawa9ly dashboard..."
);


await page.goto(
    config.sawa9ly.dashboardUrl,
    {
        waitUntil:
            "domcontentloaded",
        timeout: 60000
    }
);


await page.waitForTimeout(
    2000
);


console.log(
    `✅ Dashboard opened: ${page.url()}`
);


/* =========================================================
   SCRAPE PRODUCTS
========================================================= */

const products = [];


for (
    const item
    of limitedLinks
) {
    try {
        const product =
            await extractProduct(
                page,
                item.href
            );


        products.push(
            product
        );


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


/* =========================================================
   SAVE RAW PRODUCTS
========================================================= */

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


/* =========================================================
   SUMMARY
========================================================= */

console.log(
    "\n======================================"
);


console.log(
    `✅ Saved ${products.length} products`
);


console.log(
    `📄 ${outputFile}`
);


console.log(
    `🔗 Total discovered links: ${productLinks.length}`
);


console.log(
    `🛍️ Scrape limit: ${config.automation.scrapeLimit}`
);


console.log(
    "======================================\n"
);


/* =========================================================
   CLOSE BROWSER
========================================================= */

await browser.close();
