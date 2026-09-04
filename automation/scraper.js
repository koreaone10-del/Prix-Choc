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
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


/* =========================================================
   REMOVE UNWANTED TITLE TEXT
========================================================= */

function cleanProductName(value) {

    let text =
        cleanText(value);

    if (!text) {
        return "";
    }

    /* Remove common website suffixes */

    text =
        text
            .replace(/\s*[-|]\s*Sawa9ly.*$/i, "")
            .replace(/\s*[-|]\s*سوقلي.*$/i, "");

    /* Remove copy button text */

    text =
        text
            .replace(
                /اضغط\s+لنسخ(?:\s+النص)?/gi,
                ""
            )
            .replace(
                /اضغط\s+للنسخ/gi,
                ""
            )
            .replace(
                /copy\s+text/gi,
                ""
            )
            .replace(
                /copy/gi,
                ""
            );

    return cleanText(text);
}


/* =========================================================
   PRICE PARSER
========================================================= */

function parsePrice(value) {

    if (!value) {
        return 0;
    }

    const text =
        String(value)
            .replace(/[^\d.,\s]/g, "")
            .replace(/\s+/g, "");

    if (!text) {
        return 0;
    }

    /*
       Algerian prices normally appear like:

       12,500
       12 500
       12500
       12.500
    */

    let normalized =
        text;

    /*
       If both comma and dot exist,
       assume the separators are thousands.
    */

    if (
        normalized.includes(",") &&
        normalized.includes(".")
    ) {
        normalized =
            normalized
                .replace(/[.,]/g, "");
    } else {
        normalized =
            normalized
                .replace(/,/g, "")
                .replace(/\./g, "");
    }

    const number =
        Number(normalized);

    return Number.isFinite(number)
        ? number
        : 0;
}


/* =========================================================
   PRODUCT ID
========================================================= */

function extractProductId(url) {

    const match =
        String(url).match(
            /\/product\/(\d+)/i
        );

    return match
        ? match[1]
        : "";
}


/* =========================================================
   NORMALIZE URL
========================================================= */

function normalizeUrl(
    value,
    pageUrl
) {

    if (!value) {
        return "";
    }

    const text =
        String(value).trim();

    if (!text) {
        return "";
    }

    try {

        return new URL(
            text,
            pageUrl
        ).href;

    } catch {

        return text;
    }
}


/* =========================================================
   EXTRACT IMAGE
========================================================= */

/* =========================================================
   EXTRACT PRODUCT IMAGES
========================================================= */

async function extractProductImage(
    page
) {

    const result =
        await page.evaluate(() => {

            function clean(value) {
                if (!value) {
                    return "";
                }

                return String(value)
                    .trim();
            }

            function addImage(
                list,
                value
            ) {

                if (!value) {
                    return;
                }

                const src =
                    clean(value);

                if (!src) {
                    return;
                }

                if (
                    src.startsWith("data:")
                ) {
                    return;
                }

                const lower =
                    src.toLowerCase();

                if (
                    lower.includes("logo") ||
                    lower.includes("favicon") ||
                    lower.includes("avatar")
                ) {
                    return;
                }

                if (
                    !list.includes(src)
                ) {
                    list.push(src);
                }
            }

            function addFromImage(
                list,
                img
            ) {

                if (!img) {
                    return;
                }

                addImage(
                    list,
                    img.getAttribute("src")
                );

                addImage(
                    list,
                    img.getAttribute("data-src")
                );

                addImage(
                    list,
                    img.getAttribute("data-lazy-src")
                );

                addImage(
                    list,
                    img.getAttribute("data-original")
                );

                addImage(
                    list,
                    img.getAttribute("data-image")
                );

                /*
                   srcset can contain several
                   versions of the same image.
                */
                const srcset =
                    img.getAttribute(
                        "srcset"
                    );

                if (srcset) {

                    const candidates =
                        srcset
                            .split(",")
                            .map(
                                item =>
                                    item
                                        .trim()
                                        .split(/\s+/)[0]
                            )
                            .filter(Boolean);

                    for (
                        const candidate
                        of candidates
                    ) {
                        addImage(
                            list,
                            candidate
                        );
                    }
                }
            }

            const images = [];

            /*
               -------------------------------------------------
               1. PRODUCT / GALLERY IMAGES
               -------------------------------------------------
            */

            const gallerySelectors = [

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

                'main img',

                'article img'
            ];

            for (
                const selector
                of gallerySelectors
            ) {

                const elements =
                    Array.from(
                        document.querySelectorAll(
                            selector
                        )
                    );

                for (
                    const img
                    of elements
                ) {

                    addFromImage(
                        images,
                        img
                    );
                }
            }

            /*
               -------------------------------------------------
               2. JSON-LD PRODUCT IMAGES
               -------------------------------------------------
            */

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
                            script.textContent || ""
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
                            !item ||
                            !item.image
                        ) {
                            continue;
                        }

                        if (
                            typeof item.image ===
                            "string"
                        ) {

                            addImage(
                                images,
                                item.image
                            );
                        }

                        else if (
                            Array.isArray(
                                item.image
                            )
                        ) {

                            for (
                                const image
                                of item.image
                            ) {

                                if (
                                    typeof image ===
                                    "string"
                                ) {

                                    addImage(
                                        images,
                                        image
                                    );

                                } else if (
                                    image &&
                                    typeof image ===
                                    "object"
                                ) {

                                    addImage(
                                        images,
                                        image.url
                                    );
                                }
                            }
                        }

                        else if (
                            typeof item.image ===
                                "object"
                        ) {

                            addImage(
                                images,
                                item.image.url
                            );
                        }
                    }

                } catch {
                    /*
                       Ignore invalid JSON-LD.
                    */
                }
            }

            /*
               -------------------------------------------------
               3. META IMAGE AS FALLBACK
               -------------------------------------------------
            */

            const ogImage =
                document.querySelector(
                    'meta[property="og:image"]'
                );

            addImage(
                images,
                ogImage?.content
            );

            const twitterImage =
                document.querySelector(
                    'meta[name="twitter:image"]'
                );

            addImage(
                images,
                twitterImage?.content
            );

            /*
               -------------------------------------------------
               4. FINAL FALLBACK
               -------------------------------------------------
            */

            if (
                images.length === 0
            ) {

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

                    addFromImage(
                        images,
                        img
                    );
                }
            }

            return {
                images:
                    images
            };
        });

    const images =
        Array.isArray(
            result?.images
        )
            ? result.images
                .map(
                    image =>
                        normalizeUrl(
                            image,
                            page.url()
                        )
                )
                .filter(Boolean)
            : [];

    const uniqueImages =
        [
            ...new Set(
                images
            )
        ];

    return {
        image:
            uniqueImages[0] || "",

        images:
            uniqueImages
    };
}


            /* -----------------------------------------
               1. OG IMAGE
            ----------------------------------------- */

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


            /* -----------------------------------------
               2. TWITTER IMAGE
            ----------------------------------------- */

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


            /* -----------------------------------------
               3. JSON-LD IMAGE
            ----------------------------------------- */

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
                            script.textContent || ""
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
                            !item ||
                            !item.image
                        ) {
                            continue;
                        }

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

                } catch {
                    /* Ignore invalid JSON */
                }
            }


            /* -----------------------------------------
               4. PRODUCT/GALLERY IMAGES
            ----------------------------------------- */

            const selectors = [

                '[class*="product"] img',

                '[class*="Product"] img',

                '[class*="gallery"] img',

                '[class*="Gallery"] img',

                '[class*="swiper"] img',

                '[class*="carousel"] img',

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
                        img.getAttribute("src") ||
                        img.getAttribute("data-src") ||
                        img.getAttribute("data-lazy-src") ||
                        img.getAttribute("data-original") ||
                        img.getAttribute("data-image");

                    if (
                        src &&
                        !src.startsWith("data:")
                    ) {

                        return clean(
                            src
                        );
                    }
                }
            }


            /* -----------------------------------------
               5. ANY USEFUL IMAGE
            ----------------------------------------- */

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
                    img.getAttribute("src") ||
                    img.getAttribute("data-src") ||
                    img.getAttribute("data-lazy-src") ||
                    img.getAttribute("data-original") ||
                    img.getAttribute("data-image");

                if (!src) {
                    continue;
                }

                const lower =
                    src.toLowerCase();

                if (
                    lower.startsWith("data:")
                ) {
                    continue;
                }

                if (
                    lower.includes("logo") ||
                    lower.includes("icon") ||
                    lower.includes("avatar") ||
                    lower.includes("favicon")
                ) {
                    continue;
                }

                return clean(
                    src
                );
            }


            return "";
        });


    return normalizeUrl(
        image,
        page.url()
    );
}


/* =========================================================
   EXTRACT PRODUCT NAME
========================================================= */

async function extractProductName(
    page
) {

    const result =
        await page.evaluate(() => {

            function clean(value) {

                if (!value) {
                    return "";
                }

                return String(value)
                    .replace(/\u00a0/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
            }


            function useful(value) {

                const text =
                    clean(value);

                if (!text) {
                    return "";
                }

                if (
                    text.length < 5 ||
                    text.length > 500
                ) {
                    return "";
                }

                const lower =
                    text.toLowerCase();

                /*
                   Ignore navigation,
                   buttons and generic website text.
                */

                const ignored = [

                    "اضغط لنسخ",

                    "اضغط للنسخ",

                    "إضافة إلى السلة",

                    "أضف إلى السلة",

                    "اطلب الآن",

                    "طلباتي",

                    "الرئيسية",

                    "سوقلي",

                    "تسجيل الدخول",

                    "تسجيل",

                    "login",

                    "register",

                    "add to cart",

                    "buy now",

                    "wishlist",

                    "description",

                    "الوصف",

                    "تفاصيل المنتج"
                ];

                for (
                    const word
                    of ignored
                ) {

                    if (
                        lower ===
                        word.toLowerCase()
                    ) {
                        return "";
                    }
                }

                return text;
            }


            /* -----------------------------------------
               1. H1
            ----------------------------------------- */

            const h1 =
                document.querySelector(
                    "h1"
                );

            const h1Text =
                useful(
                    h1?.innerText
                );

            if (h1Text) {
                return {
                    name: h1Text,
                    method: "h1"
                };
            }


            /* -----------------------------------------
               2. OG TITLE
            ----------------------------------------- */

            const ogTitle =
                document.querySelector(
                    'meta[property="og:title"]'
                );

            const ogText =
                useful(
                    ogTitle?.content
                );

            if (ogText) {

                return {
                    name: ogText,
                    method: "og:title"
                };
            }


            /* -----------------------------------------
               3. TWITTER TITLE
            ----------------------------------------- */

            const twitterTitle =
                document.querySelector(
                    'meta[name="twitter:title"]'
                );

            const twitterText =
                useful(
                    twitterTitle?.content
                );

            if (twitterText) {

                return {
                    name: twitterText,
                    method: "twitter:title"
                };
            }


            /* -----------------------------------------
               4. JSON-LD PRODUCT NAME
            ----------------------------------------- */

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
                            script.textContent || ""
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
                            item.name
                        ) {

                            const value =
                                useful(
                                    item.name
                                );

                            if (value) {

                                return {
                                    name: value,
                                    method: "json-ld"
                                };
                            }
                        }
                    }

                } catch {
                    /* Ignore invalid JSON */
                }
            }


            /* -----------------------------------------
               5. COMMON TITLE CLASSES
            ----------------------------------------- */

            const titleSelectors = [

                '[class*="product-title"]',

                '[class*="Product-title"]',

                '[class*="product_title"]',

                '[class*="Product_title"]',

                '[class*="product-name"]',

                '[class*="Product-name"]',

                '[class*="product_name"]',

                '[class*="Product_name"]',

                '[class*="title"]',

                '[class*="Title"]'
            ];


            for (
                const selector
                of titleSelectors
            ) {

                const elements =
                    Array.from(
                        document.querySelectorAll(
                            selector
                        )
                    );

                for (
                    const element
                    of elements
                ) {

                    const value =
                        useful(
                            element.innerText
                        );

                    if (!value) {
                        continue;
                    }

                    /*
                       Don't accept huge blocks of text.
                    */

                    if (
                        value.length > 250
                    ) {
                        continue;
                    }

                    return {
                        name: value,
                        method: selector
                    };
                }
            }


            /* -----------------------------------------
               6. AREA AROUND "اضغط لنسخ"
            ----------------------------------------- */

            const copyWords = [

                "اضغط لنسخ",

                "اضغط للنسخ",

                "copy text",

                "copy"
            ];


            const elements =
                Array.from(
                    document.querySelectorAll(
                        "button, a, span, div"
                    )
                );


            for (
                const element
                of elements
            ) {

                const elementText =
                    clean(
                        element.innerText
                    );

                if (!elementText) {
                    continue;
                }


                const lower =
                    elementText.toLowerCase();


                let isCopyButton =
                    false;


                for (
                    const word
                    of copyWords
                ) {

                    if (
                        lower.includes(
                            word.toLowerCase()
                        )
                    ) {

                        isCopyButton =
                            true;

                        break;
                    }
                }


                if (!isCopyButton) {
                    continue;
                }


                /*
                   Search nearby parent containers.
                */

                let parent =
                    element;


                for (
                    let level = 0;
                    level < 6 && parent;
                    level++
                ) {

                    const parentText =
                        clean(
                            parent.innerText
                        );

                    if (
                        parentText &&
                        parentText.length >= 10 &&
                        parentText.length <= 800
                    ) {

                        /*
                           Search for lines that look
                           like a product title.
                        */

                        const lines =
                            parentText
                                .split("\n")
                                .map(
                                    line =>
                                        clean(line)
                                )
                                .filter(
                                    line =>
                                        line.length >= 8 &&
                                        line.length <= 250
                                );


                        /*
                           The title is usually a
                           relatively short line,
                           while the description is
                           much longer.
                        */

                        const candidates =
                            lines.filter(
                                line => {

                                    const l =
                                        line.toLowerCase();

                                    if (
                                        l.includes(
                                            "اضغط لنسخ"
                                        )
                                    ) {
                                        return false;
                                    }

                                    if (
                                        l.includes(
                                            "اضغط للنسخ"
                                        )
                                    ) {
                                        return false;
                                    }

                                    if (
                                        l.includes(
                                            "السعر"
                                        ) &&
                                        line.length < 80
                                    ) {
                                        return false;
                                    }

                                    if (
                                        /\b\d[\d\s,.]*\s*(da|dzd)\b/i.test(
                                            line
                                        )
                                    ) {
                                        return false;
                                    }

                                    return true;
                                }
                            );


                        if (
                            candidates.length
                        ) {

                            /*
                               Prefer the first candidate
                               that looks like a title.
                            */

                            const candidate =
                                candidates
                                    .sort(
                                        (
                                            a,
                                            b
                                        ) =>
                                            a.length -
                                            b.length
                                    )[0];

                            if (
                                candidate
                            ) {

                                return {
                                    name:
                                        candidate,
                                    method:
                                        "copy-area"
                                };
                            }
                        }
                    }


                    parent =
                        parent.parentElement;
                }
            }


            /* -----------------------------------------
               7. PAGE TITLE AS LAST RESORT
            ----------------------------------------- */

            const documentTitle =
                useful(
                    document.title
                );

            if (
                documentTitle
            ) {

                return {
                    name:
                        documentTitle,
                    method:
                        "document.title"
                };
            }


            return {
                name: "",
                method: "not-found"
            };
        });


    const name =
        cleanProductName(
            result?.name
        );


    if (name) {

        console.log(
            `📝 Name found (${result.method}): ${name}`
        );

    } else {

        console.log(
            "⚠️ Product name not found."
        );
    }


    return name;
}


/* =========================================================
   EXTRACT DESCRIPTION
========================================================= */

async function extractProductDescription(
    page,
    productName
) {

    const description =
        await page.evaluate(
            (knownName) => {

                function clean(value) {

                    if (!value) {
                        return "";
                    }

                    return String(value)
                        .replace(/\u00a0/g, " ")
                        .replace(/\s+/g, " ")
                        .trim();
                }


                function isBadText(text) {

                    if (!text) {
                        return true;
                    }

                    const lower =
                        text.toLowerCase();

                    const badWords = [

                        "اضغط لنسخ",

                        "اضغط للنسخ",

                        "إضافة إلى السلة",

                        "أضف إلى السلة",

                        "اطلب الآن",

                        "الرئيسية",

                        "طلباتي",

                        "تسجيل الدخول",

                        "wishlist",

                        "add to cart",

                        "buy now",

                        "login",

                        "register"
                    ];


                    return badWords.some(
                        word =>
                            lower.includes(
                                word.toLowerCase()
                            )
                    );
                }


                /*
                   First try obvious description containers.
                */

                const selectors = [

                    '[class*="description"]',

                    '[class*="Description"]',

                    '[class*="product-description"]',

                    '[class*="Product-description"]',

                    '[class*="product_description"]',

                    '[class*="Product_description"]',

                    '[id*="description"]',

                    '[id*="Description"]',

                    'article'
                ];


                for (
                    const selector
                    of selectors
                ) {

                    const elements =
                        Array.from(
                            document.querySelectorAll(
                                selector
                            )
                        );


                    for (
                        const element
                        of elements
                    ) {

                        const text =
                            clean(
                                element.innerText
                            );


                        if (
                            text.length < 30 ||
                            text.length > 10000
                        ) {
                            continue;
                        }


                        if (
                            isBadText(text)
                        ) {
                            continue;
                        }


                        /*
                           If the known product name
                           appears inside the container,
                           remove it from the description.
                        */

                        let result =
                            text;


                        if (
                            knownName &&
                            result.includes(
                                knownName
                            )
                        ) {

                            result =
                                result.replace(
                                    knownName,
                                    ""
                                );
                        }


                        result =
                            clean(
                                result
                            );


                        if (
                            result.length >= 30
                        ) {

                            return result;
                        }
                    }
                }


                /*
                   Second strategy:
                   locate the "copy" button and inspect
                   the surrounding content.
                */

                const elements =
                    Array.from(
                        document.querySelectorAll(
                            "button, a, span, div"
                        )
                    );


                for (
                    const element
                    of elements
                ) {

                    const text =
                        clean(
                            element.innerText
                        );


                    if (!text) {
                        continue;
                    }


                    const lower =
                        text.toLowerCase();


                    if (
                        !lower.includes(
                            "اضغط لنسخ"
                        ) &&
                        !lower.includes(
                            "اضغط للنسخ"
                        ) &&
                        !lower.includes(
                            "copy"
                        )
                    ) {
                        continue;
                    }


                    let parent =
                        element;


                    for (
                        let level = 0;
                        level < 6 && parent;
                        level++
                    ) {

                        const parentText =
                            clean(
                                parent.innerText
                            );


                        if (
                            parentText.length >= 30 &&
                            parentText.length <= 15000
                        ) {

                            let result =
                                parentText;


                            if (
                                knownName &&
                                result.includes(
                                    knownName
                                )
                            ) {

                                result =
                                    result.replace(
                                        knownName,
                                        ""
                                    );
                            }


                            result =
                                result
                                    .replace(
                                        /اضغط\s+لنسخ(?:\s+النص)?/gi,
                                        ""
                                    )
                                    .replace(
                                        /اضغط\s+للنسخ/gi,
                                        ""
                                    )
                                    .replace(
                                        /copy\s+text/gi,
                                        ""
                                    );


                            result =
                                clean(
                                    result
                                );


                            if (
                                result.length >= 30
                            ) {

                                return result;
                            }
                        }


                        parent =
                            parent.parentElement;
                    }
                }


                return "";
            },
            productName
        );


    const result =
        cleanText(
            description
        );


    if (result) {

        console.log(
            `📄 Description found: ${result.length} characters`
        );

    } else {

        console.log(
            "⚠️ Description not found."
        );
    }


    return result;
}


/* =========================================================
   EXTRACT PRICE
========================================================= */

async function extractBasePrice(
    page
) {

    const bodyText =
        cleanText(
            await page
                .locator("body")
                .innerText()
                .catch(
                    () => ""
                )
        );


    /*
       Price patterns used by Sawa9ly.
    */

    const pricePatterns = [

        /(\d[\d\s.,]{2,})\s*(?:دج|DA|DZD)/i,

        /(?:السعر|prix|price)\s*[:：]?\s*(\d[\d\s.,]*)/i
    ];


    for (
        const pattern
        of pricePatterns
    ) {

        const match =
            bodyText.match(
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
            price > 0
        ) {

            console.log(
                `💰 Base price found: ${price} DA`
            );

            return price;
        }
    }


    console.log(
        "⚠️ Base price not found."
    );


    return 0;
}


/* =========================================================
   EXTRACT CANONICAL URL
========================================================= */

async function extractCanonicalUrl(
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
                () => ""
            );


    return normalizeUrl(
        canonical || fallbackUrl,
        fallbackUrl
    );
}


/* =========================================================
   EXTRACT COMPLETE PRODUCT
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
            timeout:
                60000
        }
    );


    /*
       Give Sawa9ly JavaScript time to
       render the product page.
    */

    await page.waitForTimeout(
        2000
    );


    /*
       Small additional wait for
       lazy-loaded product content.
    */

    await page.waitForTimeout(
        1000
    );


    /* -----------------------------------------
       NAME
    ----------------------------------------- */

    const name =
        await extractProductName(
            page
        );


    /* -----------------------------------------
       IMAGE
    ----------------------------------------- */

    const imageData =
    await extractProductImage(
        page
    );

const image =
    imageData?.image || "";

const images =
    Array.isArray(
        imageData?.images
    )
        ? imageData.images
        : [];


    if (image) {

        console.log(
            `🖼️ Image found: ${image}`
        );

    } else {

        console.log(
            "⚠️ Product image not found."
        );
    }


    /* -----------------------------------------
       DESCRIPTION
    ----------------------------------------- */

    const description =
        await extractProductDescription(
            page,
            name
        );


    /* -----------------------------------------
       PRICE
    ----------------------------------------- */

    const basePrice =
        await extractBasePrice(
            page
        );


    /* -----------------------------------------
       PRODUCT ID
    ----------------------------------------- */

    const sourceId =
        extractProductId(
            url
        );


    /* -----------------------------------------
       SELLING PRICE
    ----------------------------------------- */

    const sellingPrice =
        calculateSellingPrice(
            basePrice
        );


    /* -----------------------------------------
       PROFIT
    ----------------------------------------- */

    const profit =
        calculateProfit(
            basePrice,
            sellingPrice
        );


    /* -----------------------------------------
       CANONICAL
    ----------------------------------------- */

    const sawa9lyLink =
        await extractCanonicalUrl(
            page,
            url
        );


    /* -----------------------------------------
       VALIDATION LOG
    ----------------------------------------- */

    console.log(
        "\n📦 PRODUCT DATA"
    );

    console.log(
        `   ID: ${sourceId || "MISSING"}`
    );

    console.log(
        `   NAME: ${name || "MISSING"}`
    );

    console.log(
        `   BASE PRICE: ${basePrice || "MISSING"} DA`
    );

    console.log(
        `   SELLING PRICE: ${sellingPrice || "MISSING"} DA`
    );

    console.log(
        `   PROFIT: ${profit || "MISSING"} DA`
    );

    console.log(
    `   IMAGE: ${image ? "FOUND" : "MISSING"}`
);

console.log(
    `   IMAGES: ${images.length} found`
);

    console.log(
        `   DESCRIPTION: ${
            description
                ? `${description.length} chars`
                : "MISSING"
        }`
    );

    console.log(
        `   LINK: ${sawa9lyLink}`
    );


    /* -----------------------------------------
       RESULT
    ----------------------------------------- */

    return {

        sawa9lyId:
            sourceId,

        name:
            name,

        description:
            description,

        basePrice:
            basePrice,

        sellingPrice:
            sellingPrice,

        profit:
            profit,

        image:
    cleanText(image),

images:
    images,

sawa9lyLink:
    sawa9lyLink,

        scrapedAt:
            new Date().toISOString()
    };
}


/* =========================================================
   LOAD DISCOVERED LINKS
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
   VALIDATE DISCOVERED LINKS
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


/* =========================================================
   NORMALIZE PRODUCT LINKS
========================================================= */

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
/* =========================================================
   SELECT NEW PRODUCTS ONLY
========================================================= */

console.log(
    "\n🔎 Checking existing products.js..."
);

let existingProductsSource = "";

try {

    existingProductsSource =
        fs.readFileSync(
            config.paths.productsFile,
            "utf8"
        );

} catch (error) {

    console.error(
        "\n❌ Could not read products.js."
    );

    console.error(
        error?.message || error
    );

    process.exit(1);
}


/*
   Extract all Sawa9ly IDs already present
   in products.js.

   We intentionally use the sawa9lyLink field
   instead of local product IDs because the
   local IDs are not the supplier IDs.
*/

const existingSawa9lyIds =
    new Set();

const existingLinkPattern =
    /sawa9lyLink\s*:\s*["'`](https?:\/\/[^"'`]+)["'`]/g;

let existingLinkMatch;

while (
    (
        existingLinkMatch =
            existingLinkPattern.exec(
                existingProductsSource
            )
    ) !== null
) {

    const existingLink =
        existingLinkMatch[1];

    const existingId =
        extractProductId(
            existingLink
        );

    if (existingId) {

        existingSawa9lyIds.add(
            existingId
        );
    }
}


console.log(
    `📦 Existing Sawa9ly products: ${existingSawa9lyIds.size}`
);


/* =========================================================
   FILTER NEW PRODUCTS
========================================================= */

const newProductLinks =
    productLinks.filter(
        item => {

            const sawa9lyId =
                extractProductId(
                    item.href
                );

            return (
                sawa9lyId &&
                !existingSawa9lyIds.has(
                    sawa9lyId
                )
            );
        }
    );


console.log(
    `🆕 New Sawa9ly products found: ${newProductLinks.length}`
);


/* =========================================================
   APPLY SAFETY LIMIT TO NEW PRODUCTS
========================================================= */

const limitedLinks =
    newProductLinks.slice(
        0,
        config.automation.scrapeLimit
    );


console.log(
    `🛍️ New products selected for scraping: ${limitedLinks.length}`
);


/*
   IMPORTANT:

   Zero new products is NOT an error.

   We create an empty products list and allow
   generator.js to run normally. This means the
   daily workflow can finish successfully even
   when Sawa9ly has no new products.
*/

if (
    limitedLinks.length === 0
) {

    console.log(
        "\n✅ No new products found."
    );

    console.log(
        "ℹ️ Existing products will not be scraped again."
    );

    const outputFile =
        path.join(
            outputDir,
            "products.raw.json"
        );

    fs.writeFileSync(
        outputFile,
        JSON.stringify(
            [],
            null,
            2
        ),
        "utf8"
    );

    const debugOutput =
        path.join(
            debugDir,
            "scraper-debug.json"
        );

    const debugReport = {

        generatedAt:
            new Date().toISOString(),

        discovered:
            productLinks.length,

        existing:
            existingSawa9lyIds.size,

        newProducts:
            0,

        selected:
            0,

        scraped:
            0,

        validNames:
            0,

        validImages:
            0,

        validPrices:
            0,

        validDescriptions:
            0,

        products:
            []
    };

    fs.writeFileSync(
        debugOutput,
        JSON.stringify(
            debugReport,
            null,
            2
        ),
        "utf8"
    );

    console.log(
        `📄 Saved empty product list: ${outputFile}`
    );

    console.log(
        "======================================\n"
    );

    process.exit(0);
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
            },

            locale: "ar-DZ"
        }
    );


const page =
    await context.newPage();


/* =========================================================
   PRODUCT SCRAPER HEADER
========================================================= */

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
        timeout:
            60000
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
   OPEN DASHBOARD
========================================================= */

console.log(
    "\n🔐 Opening Sawa9ly dashboard..."
);


await page.goto(
    config.sawa9ly.dashboardUrl,
    {
        waitUntil:
            "domcontentloaded",
        timeout:
            60000
    }
);


await page.waitForTimeout(
    2000
);


console.log(
    `✅ Dashboard opened: ${page.url()}`
);


/* =========================================================
   SCRAPE PRODUCTS - CONTROLLED CONCURRENCY
========================================================= */

const products = [];


/*
   Number of product pages running at the same time.

   Default:
   5 concurrent pages.

   You can override it from GitHub Actions with:

   SCRAPE_CONCURRENCY=5

   We intentionally keep this controlled
   to avoid overloading Sawa9ly.
*/

const scrapeConcurrency =
    Math.max(
        1,
        Number(
            process.env.SCRAPE_CONCURRENCY || 5
        )
    );


const workerCount =
    Math.min(
        scrapeConcurrency,
        limitedLinks.length
    );


console.log(
    `\n🚀 Starting parallel scraping with ${workerCount} workers...`
);

console.log(
    `📦 Total products selected: ${limitedLinks.length}`
);


/*
   The original page was used for login.
   We keep it and create additional pages
   inside the same authenticated browser context.

   Cookies/session are therefore shared.
*/

const scrapingPages =
    [page];


for (
    let i = 1;
    i < workerCount;
    i++
) {

    const workerPage =
        await context.newPage();

    scrapingPages.push(
        workerPage
    );
}


/*
   Shared queue index.

   JavaScript executes this increment
   synchronously, so each worker receives
   a different product index.
*/

let nextIndex = 0;


async function scrapeWorker(
    workerPage,
    workerNumber
) {

    while (true) {

        const currentIndex =
            nextIndex++;

        if (
            currentIndex >=
            limitedLinks.length
        ) {
            break;
        }


        const item =
            limitedLinks[
                currentIndex
            ];


        const position =
            currentIndex + 1;


        console.log(
            `\n👷 Worker ${workerNumber} → ${position}/${limitedLinks.length}`
        );


        try {

            const product =
                await extractProduct(
                    workerPage,
                    item.href
                );


            products.push(
                product
            );


            console.log(
                `\n✅ Worker ${workerNumber} → ${position}/${limitedLinks.length} → ${product.sawa9lyId} | ${product.name || "NAME MISSING"} | ${product.basePrice} DA`
            );


        } catch (error) {

            console.error(
                `\n❌ Worker ${workerNumber} failed → ${position}/${limitedLinks.length}`
            );

            console.error(
                `🔗 ${item.href}`
            );

            console.error(
                error?.message ||
                error
            );
        }
    }
}


/*
   Start all workers simultaneously.

   Promise.all waits until every worker
   has finished its queue.
*/

await Promise.all(
    scrapingPages.map(
        (
            workerPage,
            index
        ) =>
            scrapeWorker(
                workerPage,
                index + 1
            )
    )
);


console.log(
    `\n🏁 Parallel scraping completed. ${products.length}/${limitedLinks.length} products scraped.`
);


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
   SAVE DEBUG REPORT
========================================================= */

const debugOutput =
    path.join(
        debugDir,
        "scraper-debug.json"
    );


const debugReport = {

    generatedAt:
        new Date().toISOString(),

    discovered:
        productLinks.length,

    selected:
        limitedLinks.length,

    scraped:
        products.length,

    validNames:
        products.filter(
            product =>
                Boolean(
                    product.name
                )
        ).length,

    validImages:
        products.filter(
            product =>
                Boolean(
                    product.image
                )
        ).length,

    validPrices:
        products.filter(
            product =>
                Number(
                    product.basePrice
                ) > 0
        ).length,

    validDescriptions:
        products.filter(
            product =>
                Boolean(
                    product.description
                )
        ).length,

    products:
        products.map(
            product => ({

                sawa9lyId:
                    product.sawa9lyId,

                name:
                    product.name,

                basePrice:
                    product.basePrice,

                sellingPrice:
                    product.sellingPrice,

                profit:
                    product.profit,

                hasImage:
                    Boolean(
                        product.image
                    ),

                hasDescription:
                    Boolean(
                        product.description
                    ),

                sawa9lyLink:
                    product.sawa9lyLink
            })
        )
};


fs.writeFileSync(

    debugOutput,

    JSON.stringify(
        debugReport,
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
    `🧪 Debug report: ${debugOutput}`
);

console.log(
    `🔗 Total discovered links: ${productLinks.length}`
);

console.log(
    `🛍️ Scrape limit: ${config.automation.scrapeLimit}`
);

console.log(
    `⚡ Scrape concurrency: ${scrapeConcurrency}`
);

console.log(
    `📝 Names found: ${
        products.filter(
            p => Boolean(p.name)
        ).length
    }/${products.length}`
);

console.log(
    `🖼️ Images found: ${
        products.filter(
            p => Boolean(p.image)
        ).length
    }/${products.length}`
);

console.log(
    `💰 Prices found: ${
        products.filter(
            p =>
                Number(
                    p.basePrice
                ) > 0
        ).length
    }/${products.length}`
);

console.log(
    `📄 Descriptions found: ${
        products.filter(
            p => Boolean(p.description)
        ).length
    }/${products.length}`
);

console.log(
    "======================================\n"
);


/* =========================================================
   CLOSE BROWSER
========================================================= */

await browser.close();
