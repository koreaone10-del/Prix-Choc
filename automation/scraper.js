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


/*
=========================================================
 PRIX-CHOC
 SAWA9LY AFFILIATE - PRODUCT SCRAPER
=========================================================

 الوظائف:

 1. قراءة product-links.json.
 2. فحص جميع المنتجات المكتشفة.
 3. دعم /store/:id و /product/:id.
 4. استخراج:
      - ID
      - الاسم
      - الوصف
      - السعر الأصلي
      - سعر البيع
      - الربح
      - الصورة الرئيسية
      - جميع الصور
      - رابط Sawa9ly
 5. تحديث الأسعار يوميا.
 6. تحديث الصور يوميا.
 7. عدم تعديل products.js.
 8. إنشاء products.raw.json.
 9. إنشاء failed-products.json.
10. إنشاء scraper-report.json.
11. إنشاء scraper-progress.json.
12. إعادة محاولة المنتج الفاشل مرة واحدة.
13. حماية من scraping ناقص.
14. استعمال config.js كمصدر الإعدادات.
=========================================================
*/


validateConfig();


/* =======================================================
   PATHS
======================================================= */

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

const outputDir =
    path.resolve(
        config.paths.outputDir
    );

const debugDir =
    path.resolve(
        config.paths.debugDir
    );

const linksFile =
    path.join(
        debugDir,
        "product-links.json"
    );

const discoveryReportFile =
    path.join(
        debugDir,
        "discovery-report.json"
    );

const outputFile =
    path.join(
        outputDir,
        "products.raw.json"
    );

const failedProductsFile =
    path.join(
        debugDir,
        "failed-products.json"
    );

const scraperReportFile =
    path.join(
        debugDir,
        "scraper-report.json"
    );

const progressFile =
    path.join(
        debugDir,
        "scraper-progress.json"
    );


fs.mkdirSync(
    outputDir,
    { recursive: true }
);

fs.mkdirSync(
    debugDir,
    { recursive: true }
);


/* =======================================================
   SETTINGS
======================================================= */

const scrapeLimit =
    Math.max(
        1,
        Number(
            config.automation.scrapeLimit
        )
    );

const concurrencyLimit =
    Math.max(
        1,
        Number(
            config.automation.scrapeConcurrency
        )
    );

const navigationTimeout =
    Math.max(
        10000,
        Number(
            config.automation.navigationTimeoutMs
        )
    );

const pageTimeout =
    Math.max(
        10000,
        Number(
            config.automation.pageTimeoutMs
        )
    );

const renderWait =
    Math.max(
        0,
        Number(
            config.automation.renderWaitMs
        )
    );

const minimumCoverage =
    Math.max(
        0.01,
        Math.min(
            1,
            Number(
                config.automation
                    .minimumCoveragePercent
            ) / 100
        )
    );


/* =======================================================
   HELPERS
======================================================= */

function cleanText(value) {
    return String(
        value ?? ""
    )
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, " ")
        .replace(/\n+/g, " ")
        .replace(/\t+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function sleep(ms) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );
}


function readJson(
    file,
    fallback = null
) {
    try {
        if (
            !fs.existsSync(file)
        ) {
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

    } catch {
        return fallback;
    }
}


function safeJsonWrite(
    file,
    data
) {
    const directory =
        path.dirname(file);

    fs.mkdirSync(
        directory,
        { recursive: true }
    );

    const tempFile =
        `${file}.tmp`;

    fs.writeFileSync(
        tempFile,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );

    fs.renameSync(
        tempFile,
        file
    );
}


function normalizeUrl(
    value,
    baseUrl
) {
    if (!value) {
        return "";
    }

    try {
        return new URL(
            String(value).trim(),
            baseUrl
        ).href;

    } catch {
        return "";
    }
}


/* =======================================================
   PRODUCT ID / URL
======================================================= */

function productIdFromUrl(
    value
) {
    const match =
        String(
            value ?? ""
        ).match(
            /\/(?:store|product)\/(\d+)(?:[/?#]|$)/i
        );

    return match
        ? String(match[1])
        : "";
}


function normalizeProductUrl(
    value
) {
    const id =
        productIdFromUrl(
            value
        );

    if (!id) {
        return "";
    }

    const base =
        String(
            config.sawa9ly.baseUrl
        ).replace(
            /\/+$/,
            ""
        );

    return `${base}/store/${id}`;
}


/* =======================================================
   PRICE
======================================================= */

function parsePrice(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return 0;
    }

    let text =
        String(value)
            .replace(
                /\u00a0/g,
                " "
            )
            .trim();

    if (!text) {
        return 0;
    }

    text =
        text
            .replace(
                /دج/gi,
                ""
            )
            .replace(
                /DZD/gi,
                ""
            )
            .replace(
                /\bDA\b/gi,
                ""
            )
            .trim();

    const match =
        text.match(
            /\d[\d\s.,]*/
        );

    if (!match) {
        return 0;
    }

    let numberText =
        match[0]
            .replace(
                /\s+/g,
                ""
            );

    /*
     الأسعار الجزائرية:
       4200
       4 200
       4,200
       4.200
       4 200,00

     بالنسبة لمصدرنا نتعامل مع
     الفواصل والنقاط كفواصل آلاف.
    */

    numberText =
        numberText.replace(
            /[.,]/g,
            ""
        );

    const number =
        Number(
            numberText
        );

    if (
        !Number.isFinite(number)
    ) {
        return 0;
    }

    return Math.round(
        number
    );
}


/* =======================================================
   IMAGES
======================================================= */

function isUsableImageUrl(
    value
) {
    if (!value) {
        return false;
    }

    const text =
        String(value).trim();

    if (!text) {
        return false;
    }

    if (
        text.startsWith("data:") ||
        text.startsWith("blob:") ||
        text.startsWith("javascript:")
    ) {
        return false;
    }

    return true;
}


function looksLikeProductImage(
    value
) {
    const lower =
        String(
            value ?? ""
        ).toLowerCase();

    if (!lower) {
        return false;
    }

    const blocked = [
        "favicon",
        "avatar",
        "placeholder",
        "default-avatar",
        "user-avatar",
        "logo-sawa9ly",
        "logo.png",
        "logo.webp",
        "logo.jpg"
    ];

    return !blocked.some(
        item =>
            lower.includes(item)
    );
}


async function extractImages(
    page
) {
    const rawImages =
        await page.evaluate(
            () => {
                const result = [];

                const add =
                    value => {
                        if (!value) {
                            return;
                        }

                        const text =
                            String(value)
                                .trim();

                        if (!text) {
                            return;
                        }

                        if (
                            text.startsWith(
                                "data:"
                            ) ||
                            text.startsWith(
                                "blob:"
                            )
                        ) {
                            return;
                        }

                        if (
                            !result.includes(
                                text
                            )
                        ) {
                            result.push(
                                text
                            );
                        }
                    };


                const addSrcset =
                    value => {
                        if (!value) {
                            return;
                        }

                        for (
                            const item
                            of String(
                                value
                            ).split(",")
                        ) {
                            const url =
                                item
                                    .trim()
                                    .split(
                                        /\s+/
                                    )[0];

                            add(url);
                        }
                    };


                const addImage =
                    element => {
                        if (!element) {
                            return;
                        }

                        const attributes = [
                            "src",
                            "data-src",
                            "data-lazy-src",
                            "data-original",
                            "data-image",
                            "data-image-url",
                            "data-full",
                            "data-full-image",
                            "data-large",
                            "data-large-image",
                            "data-zoom-image"
                        ];

                        for (
                            const attribute
                            of attributes
                        ) {
                            add(
                                element.getAttribute(
                                    attribute
                                )
                            );
                        }

                        addSrcset(
                            element.getAttribute(
                                "srcset"
                            )
                        );

                        addSrcset(
                            element.getAttribute(
                                "data-srcset"
                            )
                        );
                    };


                const selectors = [
                    "main img",
                    "article img",

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
                    '[class*="Thumbnail"] img',

                    '[data-thumbnail] img',
                    '[data-gallery] img',
                    '[data-product-image] img',

                    "picture img"
                ];


                for (
                    const selector
                    of selectors
                ) {
                    for (
                        const element
                        of document.querySelectorAll(
                            selector
                        )
                    ) {
                        addImage(
                            element
                        );
                    }
                }


                /*
                 picture/source
                */

                for (
                    const source
                    of document.querySelectorAll(
                        "source"
                    )
                ) {
                    addSrcset(
                        source.getAttribute(
                            "srcset"
                        )
                    );

                    add(
                        source.getAttribute(
                            "src"
                        )
                    );
                }


                /*
                 روابط الصور المباشرة
                */

                for (
                    const link
                    of document.querySelectorAll(
                        "a[href]"
                    )
                ) {
                    const href =
                        link.getAttribute(
                            "href"
                        ) || "";

                    if (
                        /\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i.test(
                            href
                        )
                    ) {
                        add(href);
                    }
                }


                /*
                 OpenGraph
                */

                for (
                    const selector
                    of [
                        'meta[property="og:image"]',
                        'meta[property="og:image:url"]',
                        'meta[property="og:image:secure_url"]',
                        'meta[name="twitter:image"]',
                        'meta[name="twitter:image:src"]'
                    ]
                ) {
                    const meta =
                        document.querySelector(
                            selector
                        );

                    add(
                        meta?.content
                    );
                }


                /*
                 JSON-LD
                */

                for (
                    const script
                    of document.querySelectorAll(
                        'script[type="application/ld+json"]'
                    )
                ) {
                    try {
                        const data =
                            JSON.parse(
                                script.textContent ||
                                ""
                            );

                        const objects =
                            Array.isArray(
                                data
                            )
                                ? data
                                : [data];

                        for (
                            const object
                            of objects
                        ) {
                            if (!object) {
                                continue;
                            }

                            const image =
                                object.image;

                            if (
                                typeof image ===
                                "string"
                            ) {
                                add(image);
                            }

                            if (
                                Array.isArray(
                                    image
                                )
                            ) {
                                for (
                                    const item
                                    of image
                                ) {
                                    if (
                                        typeof item ===
                                        "string"
                                    ) {
                                        add(item);
                                    } else {
                                        add(
                                            item?.url
                                        );

                                        add(
                                            item?.contentUrl
                                        );
                                    }
                                }
                            }

                            if (
                                image &&
                                typeof image ===
                                    "object" &&
                                !Array.isArray(
                                    image
                                )
                            ) {
                                add(
                                    image.url
                                );

                                add(
                                    image.contentUrl
                                );
                            }

                            if (
                                Array.isArray(
                                    object.images
                                )
                            ) {
                                for (
                                    const item
                                    of object.images
                                ) {
                                    if (
                                        typeof item ===
                                        "string"
                                    ) {
                                        add(item);
                                    } else {
                                        add(
                                            item?.url
                                        );

                                        add(
                                            item?.contentUrl
                                        );
                                    }
                                }
                            }
                        }

                    } catch {
                        // ignore invalid JSON-LD
                    }
                }


                /*
                 fallback
                */

                if (
                    result.length === 0
                ) {
                    for (
                        const image
                        of document.querySelectorAll(
                            "img"
                        )
                    ) {
                        addImage(
                            image
                        );
                    }
                }


                return result;
            }
        );


    const images = [];


    for (
        const image
        of rawImages
    ) {
        if (
            !isUsableImageUrl(
                image
            )
        ) {
            continue;
        }

        if (
            !looksLikeProductImage(
                image
            )
        ) {
            continue;
        }

        const normalized =
            normalizeUrl(
                image,
                page.url()
            );

        if (!normalized) {
            continue;
        }

        if (
            !images.includes(
                normalized
            )
        ) {
            images.push(
                normalized
            );
        }
    }


    /*
     لا نريد صور الموقع
     أو عشرات الصور غير المتعلقة.
    */

    const limited =
        images.slice(
            0,
            20
        );


    return {
        image:
            limited[0] || "",

        images:
            limited
    };
}


/* =======================================================
   NAME
======================================================= */

async function extractName(
    page
) {
    const value =
        await page.evaluate(
            () => {
                const clean =
                    value =>
                        String(
                            value || ""
                        )
                            .replace(
                                /\u00a0/g,
                                " "
                            )
                            .replace(
                                /\s+/g,
                                " "
                            )
                            .trim();


                const invalid =
                    value => {
                        const text =
                            clean(value);

                        if (
                            !text ||
                            text.length < 3 ||
                            text.length > 300
                        ) {
                            return true;
                        }

                        const lower =
                            text.toLowerCase();

                        const rejected = [
                            "login",
                            "register",
                            "sign in",
                            "sign up",
                            "add to cart",
                            "buy now",
                            "commander maintenant",
                            "ajouter au panier",
                            "description",
                            "الوصف",
                            "تسجيل الدخول",
                            "إنشاء حساب"
                        ];

                        return rejected.includes(
                            lower
                        );
                    };


                /*
                 JSON-LD
                */

                for (
                    const script
                    of document.querySelectorAll(
                        'script[type="application/ld+json"]'
                    )
                ) {
                    try {
                        const data =
                            JSON.parse(
                                script.textContent ||
                                ""
                            );

                        const objects =
                            Array.isArray(
                                data
                            )
                                ? data
                                : [data];

                        for (
                            const object
                            of objects
                        ) {
                            if (
                                object?.name &&
                                !invalid(
                                    object.name
                                )
                            ) {
                                return clean(
                                    object.name
                                );
                            }
                        }

                    } catch {}
                }


                const direct = [
                    document.querySelector(
                        "h1"
                    )?.innerText,

                    document.querySelector(
                        '[data-product-title]'
                    )?.innerText,

                    document.querySelector(
                        '[data-product-name]'
                    )?.innerText,

                    document.querySelector(
                        'meta[property="og:title"]'
                    )?.content,

                    document.querySelector(
                        'meta[name="twitter:title"]'
                    )?.content,

                    document.querySelector(
                        "title"
                    )?.innerText
                ];


                for (
                    const candidate
                    of direct
                ) {
                    if (
                        !invalid(
                            candidate
                        )
                    ) {
                        return clean(
                            candidate
                        );
                    }
                }


                const selectors = [
                    '[class*="product-title"]',
                    '[class*="Product-title"]',
                    '[class*="product_name"]',
                    '[class*="product-name"]',
                    '[class*="Product-name"]',
                    '[class*="productName"]',
                    '[class*="title"]'
                ];


                for (
                    const selector
                    of selectors
                ) {
                    for (
                        const element
                        of document.querySelectorAll(
                            selector
                        )
                    ) {
                        const text =
                            clean(
                                element.innerText
                            );

                        if (
                            !invalid(
                                text
                            )
                        ) {
                            return text;
                        }
                    }
                }


                return "";
            }
        );


    return cleanText(
        value
    );
}


/* =======================================================
   DESCRIPTION
======================================================= */

async function extractDescription(
    page,
    productName
) {
    const value =
        await page.evaluate(
            name => {
                const clean =
                    value =>
                        String(
                            value || ""
                        )
                            .replace(
                                /\u00a0/g,
                                " "
                            )
                            .replace(
                                /\s+/g,
                                " "
                            )
                            .trim();


                const candidates = [];


                /*
                 JSON-LD
                */

                for (
                    const script
                    of document.querySelectorAll(
                        'script[type="application/ld+json"]'
                    )
                ) {
                    try {
                        const data =
                            JSON.parse(
                                script.textContent ||
                                ""
                            );

                        const objects =
                            Array.isArray(
                                data
                            )
                                ? data
                                : [data];

                        for (
                            const object
                            of objects
                        ) {
                            if (
                                object?.description
                            ) {
                                candidates.push(
                                    object.description
                                );
                            }
                        }

                    } catch {}
                }


                candidates.push(
                    document.querySelector(
                        'meta[name="description"]'
                    )?.content
                );

                candidates.push(
                    document.querySelector(
                        'meta[property="og:description"]'
                    )?.content
                );


                const nameLower =
                    clean(
                        name
                    ).toLowerCase();


                for (
                    const candidate
                    of candidates
                ) {
                    const text =
                        clean(
                            candidate
                        );

                    if (
                        text.length < 20 ||
                        text.length > 10000
                    ) {
                        continue;
                    }

                    if (
                        nameLower &&
                        text.toLowerCase() ===
                            nameLower
                    ) {
                        continue;
                    }

                    return text;
                }


                const selectors = [
                    '[class*="product-description"]',
                    '[class*="Product-description"]',
                    '[class*="productDescription"]',
                    '[class*="description"]',
                    '[class*="Description"]',
                    '[class*="details"]',
                    '[class*="Details"]',
                    '[data-description]'
                ];


                for (
                    const selector
                    of selectors
                ) {
                    for (
                        const element
                        of document.querySelectorAll(
                            selector
                        )
                    ) {
                        const text =
                            clean(
                                element.innerText
                            );

                        if (
                            text.length >= 20 &&
                            text.length <= 10000
                        ) {
                            return text;
                        }
                    }
                }


                return "";
            },
            productName
        );


    return cleanText(
        value
    );
}


/* =======================================================
   PRICE EXTRACTION
======================================================= */

async function extractBasePrice(
    page
) {
    const candidates =
        await page.evaluate(
            () => {
                const result = [];


                const add =
                    value => {
                        if (
                            value !== null &&
                            value !== undefined &&
                            String(value).trim()
                        ) {
                            result.push(
                                String(value)
                            );
                        }
                    };


                /*
                 JSON-LD
                */

                for (
                    const script
                    of document.querySelectorAll(
                        'script[type="application/ld+json"]'
                    )
                ) {
                    try {
                        const data =
                            JSON.parse(
                                script.textContent ||
                                ""
                            );

                        const objects =
                            Array.isArray(
                                data
                            )
                                ? data
                                : [data];

                        for (
                            const object
                            of objects
                        ) {
                            if (
                                object?.offers
                            ) {
                                const offers =
                                    Array.isArray(
                                        object.offers
                                    )
                                        ? object.offers
                                        : [
                                            object.offers
                                        ];

                                for (
                                    const offer
                                    of offers
                                ) {
                                    add(
                                        offer?.price
                                    );

                                    add(
                                        offer?.lowPrice
                                    );
                                }
                            }

                            add(
                                object?.price
                            );
                        }

                    } catch {}
                }


                /*
                 Meta
                */

                for (
                    const selector
                    of [
                        'meta[property="product:price:amount"]',
                        'meta[itemprop="price"]'
                    ]
                ) {
                    add(
                        document.querySelector(
                            selector
                        )?.content
                    );
                }


                /*
                 data-price
                */

                for (
                    const element
                    of document.querySelectorAll(
                        "[data-price], [data-product-price]"
                    )
                ) {
                    add(
                        element.getAttribute(
                            "data-price"
                        )
                    );

                    add(
                        element.getAttribute(
                            "data-product-price"
                        )
                    );
                }


                /*
                 Price elements
                */

                for (
                    const element
                    of document.querySelectorAll(
                        [
                            '[class*="product-price"]',
                            '[class*="Product-price"]',
                            '[class*="productPrice"]',
                            '[class*="price"]',
                            '[class*="Price"]',
                            '[class*="montant"]',
                            '[class*="Montant"]'
                        ].join(",")
                    )
                ) {
                    add(
                        element.innerText
                    );
                }


                /*
                 body fallback
                */

                add(
                    document.body?.innerText ||
                    ""
                );


                return result;
            }
        );


    /*
     أولوية:
       1. دج / DA / DZD
       2. السعر / prix / price
       3. رقم مباشر
    */

    const unitPatterns = [
        /(\d[\d\s.,]{1,})\s*(?:دج|DA|DZD)\b/i,
        /(?:السعر|prix|price|montant)\s*[:：]?\s*(\d[\d\s.,]*)/i
    ];


    for (
        const candidate
        of candidates
    ) {
        const text =
            String(
                candidate || ""
            );


        for (
            const pattern
            of unitPatterns
        ) {
            const match =
                text.match(
                    pattern
                );

            if (!match) {
                continue;
            }

            const price =
                parsePrice(
                    match[1]
                );

            if (
                price > 0 &&
                price < 100000000
            ) {
                return price;
            }
        }
    }


    /*
     رقم مباشر.
    */

    for (
        const candidate
        of candidates
    ) {
        const text =
            String(
                candidate || ""
            ).trim();

        if (
            !/^\d[\d\s.,]*$/.test(
                text
            )
        ) {
            continue;
        }

        const price =
            parsePrice(
                text
            );

        if (
            price > 0 &&
            price < 100000000
        ) {
            return price;
        }
    }


    return 0;
}


/* =======================================================
   CANONICAL LINK
======================================================= */

async function extractCanonical(
    page,
    fallbackUrl
) {
    const canonical =
        await page
            .locator(
                'link[rel="canonical"]'
            )
            .getAttribute(
                "href"
            )
            .catch(
                () => null
            );


    const canonicalUrl =
        normalizeUrl(
            canonical,
            page.url()
        );


    const id =
        productIdFromUrl(
            canonicalUrl
        ) ||
        productIdFromUrl(
            page.url()
        ) ||
        productIdFromUrl(
            fallbackUrl
        );


    if (!id) {
        return normalizeProductUrl(
            fallbackUrl
        );
    }


    const base =
        String(
            config.sawa9ly.baseUrl
        ).replace(
            /\/+$/,
            ""
        );


    return `${base}/store/${id}`;
}


/* =======================================================
   PAGE PREPARATION
======================================================= */

async function prepareProductPage(
    page
) {
    await page
        .waitForLoadState(
            "domcontentloaded",
            {
                timeout:
                    pageTimeout
            }
        )
        .catch(
            () => {}
        );


    if (
        renderWait > 0
    ) {
        await page.waitForTimeout(
            renderWait
        );
    }


    await Promise.race([
        page
            .waitForSelector(
                "h1",
                {
                    timeout: 8000
                }
            )
            .catch(
                () => {}
            ),

        page
            .waitForSelector(
                '[class*="product"]',
                {
                    timeout: 8000
                }
            )
            .catch(
                () => {}
            ),

        page
            .waitForSelector(
                '[class*="price"]',
                {
                    timeout: 8000
                }
            )
            .catch(
                () => {}
            )
    ]);


    if (
        renderWait > 0
    ) {
        await page.waitForTimeout(
            Math.min(
                renderWait,
                1500
            )
        );
    }
}


/* =======================================================
   LOGIN DETECTION
======================================================= */

async function isLoginPage(
    page
) {
    const url =
        page.url();


    if (
        /\/login(?:[/?#]|$)/i.test(
            url
        )
    ) {
        return true;
    }


    const body =
        cleanText(
            await page
                .locator("body")
                .innerText()
                .catch(
                    () => ""
                )
        );


    const lower =
        body.toLowerCase();


    const indicators = [
        "تسجيل الدخول",
        "connexion",
        "se connecter",
        "login",
        "sign in"
    ];


    return indicators.some(
        indicator =>
            lower.includes(
                indicator.toLowerCase()
            )
    );
}


/* =======================================================
   LOGIN
======================================================= */

async function login(
    page
) {
    const loginUrl =
        config.sawa9ly.loginUrl;


    console.log(
        `🔐 Opening Sawa9ly login: ${loginUrl}`
    );


    await page.goto(
        loginUrl,
        {
            waitUntil:
                "domcontentloaded",

            timeout:
                navigationTimeout
        }
    );


    await page.waitForTimeout(
        Math.min(
            config.automation.loginWait,
            5000
        )
    );


    if (
        !(await isLoginPage(
            page
        ))
    ) {
        console.log(
            "✅ Existing authenticated session detected."
        );

        return;
    }


    const email =
        config.sawa9ly.email;

    const password =
        config.sawa9ly.password;


    if (
        !email ||
        !password
    ) {
        throw new Error(
            "SAWA9LY_EMAIL / SAWA9LY_PASSWORD are missing."
        );
    }


    const emailInput =
        page
            .locator(
                'input[type="email"]'
            )
            .first();


    if (
        await emailInput.count() ===
        0
    ) {
        throw new Error(
            "Could not find Sawa9ly email input."
        );
    }


    await emailInput.fill(
        email
    );


    const passwordInput =
        page
            .locator(
                'input[type="password"]'
            )
            .first();


    if (
        await passwordInput.count() ===
        0
    ) {
        throw new Error(
            "Could not find Sawa9ly password input."
        );
    }


    await passwordInput.fill(
        password
    );


    const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Connexion")',
        'button:has-text("Se connecter")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("تسجيل الدخول")'
    ];


    let submitted =
        false;


    for (
        const selector
        of submitSelectors
    ) {
        const button =
            page
                .locator(
                    selector
                )
                .first();


        if (
            await button.count()
                .catch(
                    () => 0
                )
        ) {
            await button
                .click()
                .catch(
                    () => {}
                );

            submitted =
                true;

            break;
        }
    }


    if (
        !submitted
    ) {
        await passwordInput.press(
            "Enter"
        );
    }


    await page.waitForTimeout(
        Math.max(
            2500,
            config.automation.loginWait
        )
    );


    await page
        .waitForLoadState(
            "domcontentloaded",
            {
                timeout:
                    15000
            }
        )
        .catch(
            () => {}
        );


    if (
        await isLoginPage(
            page
        )
    ) {
        throw new Error(
            "Sawa9ly login failed or session was not established."
        );
    }


    console.log(
        `✅ Sawa9ly authenticated: ${page.url()}`
    );
}


/* =======================================================
   PRODUCT EXTRACTION
======================================================= */

async function extractProduct(
    page,
    originalUrl
) {
    const normalizedUrl =
        normalizeProductUrl(
            originalUrl
        );


    if (!normalizedUrl) {
        throw new Error(
            `Invalid product URL: ${originalUrl}`
        );
    }


    const requestedId =
        productIdFromUrl(
            normalizedUrl
        );


    if (!requestedId) {
        throw new Error(
            `Could not extract product ID from ${normalizedUrl}`
        );
    }


    await page.goto(
        normalizedUrl,
        {
            waitUntil:
                "domcontentloaded",

            timeout:
                navigationTimeout
        }
    );


    await prepareProductPage(
        page
    );


    if (
        await isLoginPage(
            page
        )
    ) {
        throw new Error(
            "Sawa9ly session expired while scraping."
        );
    }


    const bodyText =
        cleanText(
            await page
                .locator("body")
                .innerText()
                .catch(
                    () => ""
                )
        );


    if (
        /page not found|product not found|\b404\b/i.test(
            bodyText
        )
    ) {
        throw new Error(
            "Sawa9ly product page returned Not Found."
        );
    }


    const finalId =
        productIdFromUrl(
            page.url()
        ) ||
        requestedId;


    if (!finalId) {
        throw new Error(
            "Could not determine final Sawa9ly product ID."
        );
    }


    const name =
        await extractName(
            page
        );


    if (!name) {
        throw new Error(
            `Product ${finalId}: name not found.`
        );
    }


    const description =
        await extractDescription(
            page,
            name
        );


    const basePrice =
        await extractBasePrice(
            page
        );


    if (
        !basePrice ||
        basePrice <= 0
    ) {
        throw new Error(
            `Product ${finalId}: valid source price not found.`
        );
    }


    const imageData =
        await extractImages(
            page
        );


    if (
        !imageData.image ||
        !imageData.images.length
    ) {
        throw new Error(
            `Product ${finalId}: product image not found.`
        );
    }


    const sellingPrice =
        calculateSellingPrice(
            basePrice
        );


    const profit =
        calculateProfit(
            basePrice,
            sellingPrice
        );


    const sawa9lyLink =
        await extractCanonical(
            page,
            normalizedUrl
        );


    return {
        sawa9lyId:
            String(finalId),

        name:
            cleanText(name),

        description:
            cleanText(
                description
            ),

        basePrice:
            Number(
                basePrice
            ),

        sellingPrice:
            Number(
                sellingPrice
            ),

        profit:
            Number(
                profit
            ),

        image:
            imageData.image,

        images:
            imageData.images,

        sawa9lyLink:
            sawa9lyLink ||
            normalizedUrl,

        available:
            true,

        automated:
            true,

        scrapedAt:
            new Date().toISOString()
    };
}


/* =======================================================
   LOAD DISCOVERED LINKS
======================================================= */

function loadProductLinks() {
    if (
        !fs.existsSync(
            linksFile
        )
    ) {
        throw new Error(
            `product-links.json not found: ${linksFile}`
        );
    }


    const raw =
        readJson(
            linksFile,
            null
        );


    if (!Array.isArray(raw)) {
        throw new Error(
            "product-links.json must contain an array."
        );
    }


    const map =
        new Map();


    for (
        const item
        of raw
    ) {
        const href =
            typeof item ===
            "string"
                ? item
                : item?.href ||
                  item?.url ||
                  item?.sawa9lyLink;


        const normalized =
            normalizeProductUrl(
                href
            );


        if (!normalized) {
            continue;
        }


        const id =
            productIdFromUrl(
                normalized
            );


        if (!id) {
            continue;
        }


        if (
            !map.has(id)
        ) {
            map.set(
                id,
                {
                    sawa9lyId:
                        id,

                    href:
                        normalized
                }
            );
        }
    }


    return [
        ...map.values()
    ];
}


/* =======================================================
   DISCOVERY SAFETY
======================================================= */

function validateDiscoverySafety(
    productLinks
) {
    if (
        !fs.existsSync(
            discoveryReportFile
        )
    ) {
        throw new Error(
            "discovery-report.json is missing. Scraping stopped for safety."
        );
    }


    const report =
        readJson(
            discoveryReportFile,
            null
        );


    if (!report) {
        throw new Error(
            "discovery-report.json is invalid."
        );
    }


    if (
        report.complete === false
    ) {
        throw new Error(
            "Discovery is incomplete. Scraping stopped for safety."
        );
    }


    if (
        report.availabilitySafe === false
    ) {
        throw new Error(
            "Discovery is not availability-safe. Scraping stopped."
        );
    }


    const discoveredCount =
        Number(
            report.uniqueProductsFound ??
            report.productsFound ??
            report.discovered ??
            0
        );


    if (
        discoveredCount > 0 &&
        productLinks.length === 0
    ) {
        throw new Error(
            "Discovery reports products but scraper found zero valid product links."
        );
    }


    if (
        discoveredCount > 0 &&
        productLinks.length <
            Math.floor(
                discoveredCount *
                0.90
            )
    ) {
        throw new Error(
            `Scraper received only ${productLinks.length} links while Discovery reported ${discoveredCount}.`
        );
    }
}


/* =======================================================
   PROGRESS
======================================================= */

function saveProgress(
    total,
    completed,
    successful,
    failed
) {
    const coverage =
        total > 0
            ? Number(
                (
                    successful /
                    total
                ).toFixed(4)
            )
            : 0;


    safeJsonWrite(
        progressFile,
        {
            updatedAt:
                new Date().toISOString(),

            total,

            completed,

            successful,

            failed,

            coverage,

            minimumCoverage
        }
    );
}


/* =======================================================
   MAIN
======================================================= */

async function main() {
    console.log("");
    console.log(
        "=================================================="
    );
    console.log(
        " PRIX CHOC - SAWA9LY FULL PRODUCT SCRAPER"
    );
    console.log(
        "=================================================="
    );
    console.log("");


    const productLinks =
        loadProductLinks();


    validateDiscoverySafety(
        productLinks
    );


    if (
        productLinks.length === 0
    ) {
        throw new Error(
            "No valid Sawa9ly products discovered."
        );
    }


    /*
     مهم:

     كل المنتجات المكتشفة تدخل
     scraping في كل تشغيل.

     هذا هو ما يسمح بتحديث
     الأسعار والصور يوميا.
    */

    const selectedLinks =
        productLinks.slice(
            0,
            Math.min(
                scrapeLimit,
                productLinks.length
            )
        );


    const concurrency =
        Math.min(
            concurrencyLimit,
            selectedLinks.length
        );


    console.log(
        `📦 Discovered products : ${productLinks.length}`
    );

    console.log(
        `🔎 Products to scrape  : ${selectedLinks.length}`
    );

    console.log(
        `⚙️ Concurrency          : ${concurrency}`
    );

    console.log(
        `📊 Minimum coverage     : ${(
            minimumCoverage *
            100
        ).toFixed(0)}%`
    );

    console.log(
        `🌐 Sawa9ly              : ${config.sawa9ly.baseUrl}`
    );

    console.log("");


    /*
     Browser
    */

    const browser =
        await chromium.launch({
            headless:
                config.automation.headless,

            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu"
            ]
        });


    const browserConfig =
        config.browser || {};


    const context =
        await browser.newContext({
            viewport:
                browserConfig.viewport || {
                    width: 1440,
                    height: 900
                },

            locale:
                browserConfig.locale ||
                "fr-DZ",

            timezoneId:
                browserConfig.timezoneId ||
                "Africa/Algiers",

            userAgent:
                browserConfig.userAgent
        });


    context.setDefaultTimeout(
        pageTimeout
    );

    context.setDefaultNavigationTimeout(
        navigationTimeout
    );


    const loginPage =
        await context.newPage();


    try {
        await login(
            loginPage
        );
    } finally {
        await loginPage
            .close()
            .catch(
                () => {}
            );
    }


    /*
     Workers
    */

    const pages = [];

    for (
        let i = 0;
        i < concurrency;
        i++
    ) {
        pages.push(
            await context.newPage()
        );
    }


    const products = [];
    const failed = [];


    let nextIndex = 0;
    let completed = 0;


    /*
     Worker function
    */

    async function worker(
        page
    ) {
        while (true) {
            const index =
                nextIndex++;


            if (
                index >=
                selectedLinks.length
            ) {
                return;
            }


            const item =
                selectedLinks[index];


            const position =
                index + 1;


            let product =
                null;

            let lastError =
                null;


            /*
             Retry once.
            */

            for (
                let attempt = 1;
                attempt <= 2;
                attempt++
            ) {
                try {
                    product =
                        await extractProduct(
                            page,
                            item.href
                        );

                    break;

                } catch (
                    error
                ) {
                    lastError =
                        error;

                    if (
                        attempt === 1
                    ) {
                        await sleep(
                            700
                        );
                    }
                }
            }


            if (
                product
            ) {
                products.push(
                    product
                );

                completed++;


                console.log(
                    `✅ ${position}/${selectedLinks.length} | ` +
                    `${product.sawa9lyId} | ` +
                    `${product.basePrice} DA | ` +
                    `${product.images.length} images`
                );

            } else {
                completed++;


                const failedItem = {
                    position,

                    sawa9lyId:
                        item.sawa9lyId,

                    href:
                        item.href,

                    error:
                        lastError?.message ||
                        String(
                            lastError
                        ),

                    failedAt:
                        new Date().toISOString()
                };


                failed.push(
                    failedItem
                );


                console.error(
                    `❌ ${position}/${selectedLinks.length} | ` +
                    `${item.sawa9lyId} | ` +
                    `${failedItem.error}`
                );
            }


            saveProgress(
                selectedLinks.length,
                completed,
                products.length,
                failed.length
            );
        }
    }


    /*
     Run workers.
    */

    await Promise.all(
        pages.map(
            page =>
                worker(
                    page
                )
        )
    );


    /*
     Close pages/context/browser.
    */

    for (
        const page
        of pages
    ) {
        await page
            .close()
            .catch(
                () => {}
            );
    }


    await context
        .close()
        .catch(
            () => {}
        );


    await browser
        .close()
        .catch(
            () => {}
        );


    /*
     Sort.
    */

    products.sort(
        (a, b) =>
            Number(
                a.sawa9lyId
            ) -
            Number(
                b.sawa9lyId
            )
    );


    failed.sort(
        (a, b) =>
            Number(
                a.position
            ) -
            Number(
                b.position
            )
    );


    /*
     Coverage.
    */

    const total =
        selectedLinks.length;

    const successful =
        products.length;

    const failedCount =
        failed.length;


    const coverage =
        total > 0
            ? Number(
                (
                    successful /
                    total
                ).toFixed(4)
            )
            : 0;


    const coverageSafe =
        coverage >=
        minimumCoverage;


    /*
     Important safety rule:

     إذا كانت التغطية أقل من الحد،
     نكتب التقرير وraw data للتشخيص،
     لكن generator.js يجب أن يرفض النشر.
    */

    safeJsonWrite(
        outputFile,
        products
    );


    safeJsonWrite(
        failedProductsFile,
        failed
    );


    const report = {
        generatedAt:
            new Date().toISOString(),

        discovered:
            productLinks.length,

        selected:
            selectedLinks.length,

        scraped:
            successful,

        failed:
            failedCount,

        coverage,

        minimumSafeCoverage:
            minimumCoverage,

        coverageSafe,

        success:
            coverageSafe,

        productsRawFile:
            outputFile,

        failedProductsFile,

        message:
            coverageSafe
                ? "Scraping coverage is safe."
                : "Scraping coverage is below the safe threshold. Generator must refuse publication."
    };


    safeJsonWrite(
        scraperReportFile,
        report
    );


    /*
     Final log.
    */

    console.log("");

    console.log(
        "=================================================="
    );

    console.log(
        "           SCRAPER COMPLETED"
    );

    console.log(
        "=================================================="
    );

    console.log(
        `Discovered : ${productLinks.length}`
    );

    console.log(
        `Selected   : ${selectedLinks.length}`
    );

    console.log(
        `Scraped    : ${successful}`
    );

    console.log(
        `Failed     : ${failedCount}`
    );

    console.log(
        `Coverage   : ${(coverage * 100).toFixed(2)}%`
    );

    console.log(
        `Required   : ${(minimumCoverage * 100).toFixed(2)}%`
    );

    console.log(
        `Safe       : ${coverageSafe ? "YES" : "NO"}`
    );

    console.log("");

    console.log(
        `📄 ${outputFile}`
    );

    console.log(
        `📄 ${failedProductsFile}`
    );

    console.log(
        `📄 ${scraperReportFile}`
    );


    /*
     لا نعتبر التشغيل ناجحا إذا كانت
     التغطية أقل من الحد.

     هذا مهم جدا حتى لا يقوم
     generator.js بتحديث المنتجات
     ببيانات ناقصة.
    */

    if (
        !coverageSafe
    ) {
        throw new Error(
            `Scraping coverage ${(coverage * 100).toFixed(2)}% is below the required ${(minimumCoverage * 100).toFixed(2)}%. Publication blocked.`
        );
    }


    return report;
}


/* =======================================================
   START
======================================================= */

main()
    .then(
        () => {
            console.log("");
            console.log(
                "✅ Scraper finished successfully."
            );

            process.exit(0);
        }
    )
    .catch(
        error => {
            console.error("");
            console.error(
                "=================================================="
            );
            console.error(
                "             ❌ SCRAPER FAILED"
            );
            console.error(
                "=================================================="
            );
            console.error("");

            console.error(
                error?.stack ||
                error?.message ||
                String(error)
            );

            console.error("");

            console.error(
                "🛑 products.js was NOT modified."
            );

            console.error(
                "🛑 Existing products are NOT deleted."
            );

            process.exit(1);
        }
    );
