import fs from "fs";
import path from "path";

import { config } from "./config.js";


/* =========================================================
   FILES
========================================================= */

const rawFile =
    path.resolve(
        "./output/products.raw.json"
    );

const linksFile =
    path.resolve(
        "./debug/product-links.json"
    );

const productsFile =
    config.paths.productsFile;


/* =========================================================
   CHECK FILES
========================================================= */

if (!fs.existsSync(rawFile)) {

    console.error(
        "❌ products.raw.json غير موجود."
    );

    console.error(
        "شغّل أولاً: npm run scrape"
    );

    process.exit(1);
}


if (!fs.existsSync(productsFile)) {

    console.error(
        `❌ products.js غير موجود: ${productsFile}`
    );

    process.exit(1);
}


/* =========================================================
   LOAD DATA
========================================================= */

const products =
    JSON.parse(
        fs.readFileSync(
            rawFile,
            "utf8"
        )
    );


let current =
    fs.readFileSync(
        productsFile,
        "utf8"
    );


/* =========================================================
   LOAD DISCOVERED LINKS
========================================================= */

let discoveredLinks = [];

if (
    fs.existsSync(
        linksFile
    )
) {

    try {

        discoveredLinks =
            JSON.parse(
                fs.readFileSync(
                    linksFile,
                    "utf8"
                )
            );

        if (
            !Array.isArray(
                discoveredLinks
            )
        ) {

            discoveredLinks = [];
        }

    } catch (error) {

        console.warn(
            "⚠️ تعذر قراءة product-links.json."
        );

        discoveredLinks = [];
    }

} else {

    console.warn(
        "⚠️ product-links.json غير موجود."
    );
}


/* =========================================================
   HELPERS
========================================================= */

function escapeString(
    value
) {

    return String(
        value || ""
    )
        .replace(
            /\\/g,
            "\\\\"
        )
        .replace(
            /"/g,
            '\\"'
        )
        .replace(
            /\r?\n/g,
            " "
        );
}


/* =========================================================
   NORMALIZE PRODUCT LINK
========================================================= */

function normalizeProductLink(
    value
) {

    if (!value) {
        return "";
    }

    try {

        const url =
            new URL(
                String(value)
            );

        return (
            url.origin +
            url.pathname
        )
            .replace(
                /\/+$/,
                ""
            )
            .toLowerCase();

    } catch {

        return String(
            value
        )
            .trim()
            .replace(
                /\/+$/,
                ""
            )
            .toLowerCase();
    }
}


/* =========================================================
   GET DISCOVERED PRODUCT COUNT
========================================================= */

const uniqueDiscoveredLinks =
    Array.from(
        new Set(
            discoveredLinks
                .map(
                    normalizeProductLink
                )
                .filter(Boolean)
        )
    );


/* =========================================================
   GET SCRAPE LIMIT
========================================================= */

const scrapeLimit =
    Number(
        config.automation.scrapeLimit || 0
    );


/* =========================================================
   VERIFY FULL SCAN SAFETY
========================================================= */

/*
   We ONLY mark missing automated products as unavailable
   when the scraper has demonstrably processed the complete
   discovered catalog.

   If there are more discovered products than SCRAPE_LIMIT,
   we do NOT mark anything unavailable because some products
   were intentionally not scanned.
*/

const fullCatalogCanBeVerified =
    uniqueDiscoveredLinks.length > 0 &&
    (
        scrapeLimit <= 0 ||
        uniqueDiscoveredLinks.length <=
            scrapeLimit
    ) &&
    products.length ===
        uniqueDiscoveredLinks.length;


/* =========================================================
   EXTRACT EXISTING LOCAL IDS
========================================================= */

function extractExistingIds(
    content
) {

    const ids = [];

    const regex =
        /["']([^"']+)["']\s*:\s*\{/g;

    let match;

    while (
        (match = regex.exec(content))
    ) {

        ids.push(
            match[1]
        );
    }

    return ids;
}


/* =========================================================
   NEXT LOCAL PRODUCT ID
========================================================= */

function getNextLocalId(
    existingIds
) {

    let max = 0;

    for (
        const id of existingIds
    ) {

        if (
            /^\d+$/.test(id)
        ) {

            max =
                Math.max(
                    max,
                    Number(id)
                );
        }
    }

    return String(
        max + 1
    );
}


/* =========================================================
   EXTRACT SAWA9LY ID
========================================================= */

function extractSawa9lyId(
    value
) {

    if (!value) {
        return "";
    }

    const match =
        String(value).match(
            /\/product\/(\d+)/i
        );

    return match
        ? match[1]
        : "";
}


/* =========================================================
   FIND PRODUCT BLOCK
========================================================= */

function findProductBlock(
    content,
    sawa9lyId
) {

    if (!sawa9lyId) {
        return null;
    }


    const regex =
        /^\s*["']([^"']+)["']\s*:\s*\{[\s\S]*?^\s*\},?/gm;


    let match;

    while (
        (match = regex.exec(content))
    ) {

        const block =
            match[0];

        const blockId =
            match[1];


        const blockSawa9lyId =
            extractSawa9lyId(
                block
            );


        if (
            blockSawa9lyId ===
            String(sawa9lyId)
        ) {

            return {
                id: blockId,
                block,
                start: match.index,
                end: regex.lastIndex
            };
        }
    }


    return null;
}


/* =========================================================
   CHECK AUTOMATED PRODUCT
========================================================= */

function isAutomatedBlock(
    block
) {

    return (
        /automated\s*:\s*true/.test(
            block
        )
    );
}


/* =========================================================
   SET AVAILABILITY
========================================================= */

function setAvailability(
    block,
    available
) {

    const value =
        available
            ? "true"
            : "false";


    /*
       If availability already exists,
       replace its value.
    */

    if (
        /available\s*:/.test(
            block
        )
    ) {

        return block.replace(
            /available\s*:\s*(true|false)/,
            `available: ${value}`
        );
    }


    /*
       Otherwise insert it before automated.
    */

    if (
        /automated\s*:\s*true/.test(
            block
        )
    ) {

        return block.replace(
            /(\s*automated\s*:\s*true)/,
            `\n        available: ${value},$1`
        );
    }


    return block;
}


/* =========================================================
   BUILD PRODUCT OBJECT
========================================================= */

function buildProductObject(
    product
) {

    return `{
        name: "${escapeString(product.name)}",
        description: "${escapeString(product.description)}",
        price: ${Number(product.sellingPrice || 0)},
        image: "${escapeString(product.image)}",
        sawa9lyLink: "${escapeString(product.sawa9lyLink)}",
        basePrice: ${Number(product.basePrice || 0)},
        profit: ${Number(product.profit || 0)},
        automated: true,
        available: true,
        updatedAt: "${escapeString(product.scrapedAt)}"
    }`;
}


/* =========================================================
   VALIDATE PRODUCT
========================================================= */

function isCompleteProduct(
    product
) {

    return Boolean(
        product &&
        product.sawa9lyId &&
        product.name &&
        product.image &&
        product.basePrice
    );
}


/* =========================================================
   INITIAL DATA
========================================================= */

const existingIds =
    extractExistingIds(
        current
    );


const scrapedSawa9lyIds =
    new Set();


let addedCount = 0;

let updatedCount = 0;

let skippedCount = 0;

let unavailableCount = 0;

let restoredCount = 0;


/* =========================================================
   PROCESS SCRAPED PRODUCTS
========================================================= */

for (
    const product of products
) {

    /* -----------------------------------------------------
       VALIDATE
    ----------------------------------------------------- */

    if (
        !isCompleteProduct(
            product
        )
    ) {

        console.log(
            `⚠️ Skipped incomplete product: ${product?.sawa9lyId || "unknown"}`
        );

        skippedCount++;

        continue;
    }


    const sawa9lyId =
        String(
            product.sawa9lyId
        );


    /*
       Remember every successfully scraped Sawa9ly product.
    */

    scrapedSawa9lyIds.add(
        sawa9lyId
    );


    /* -----------------------------------------------------
       CHECK EXISTING PRODUCT
    ----------------------------------------------------- */

    const existing =
        findProductBlock(
            current,
            sawa9lyId
        );


    /* =====================================================
       UPDATE EXISTING PRODUCT
    ===================================================== */

    if (existing) {

        const wasUnavailable =
            /available\s*:\s*false/.test(
                existing.block
            );


        const newBlock =
            `"${existing.id}": ${buildProductObject(product)},`;


        current =
            current.slice(
                0,
                existing.start
            ) +
            newBlock +
            current.slice(
                existing.end
            );


        updatedCount++;


        if (
            wasUnavailable
        ) {

            restoredCount++;

            console.log(
                `🟢 Restored product ${existing.id} ← Sawa9ly ${sawa9lyId}`
            );

        } else {

            console.log(
                `🔄 Updated product ${existing.id} ← Sawa9ly ${sawa9lyId}`
            );
        }


        continue;
    }


    /* =====================================================
       ADD NEW PRODUCT
    ===================================================== */

    const localId =
        getNextLocalId(
            existingIds
                .concat(
                    Array.from(
                        {
                            length:
                                addedCount
                        },
                        (_, index) =>
                            String(
                                Number(
                                    getNextLocalId(
                                        existingIds
                                    )
                                ) +
                                index
                            )
                    )
                )
        );


    const insertPosition =
        current.lastIndexOf(
            "};"
        );


    if (
        insertPosition === -1
    ) {

        console.error(
            "❌ لم أجد نهاية storeData في products.js"
        );

        process.exit(1);
    }


    const beforeInsert =
        current.slice(
            0,
            insertPosition
        );


    const afterInsert =
        current.slice(
            insertPosition
        );


    /*
       Make sure the previous
       product ends with comma.
    */

    const normalizedBeforeInsert =
        beforeInsert
            .trimEnd()
            .endsWith(",")
            ? beforeInsert
            : beforeInsert.trimEnd() +
              ",\n";


    const newBlock =
        `\n    "${localId}": ${buildProductObject(product)},\n`;


    current =
        normalizedBeforeInsert +
        newBlock +
        afterInsert;


    addedCount++;


    console.log(
        `➕ New product ${localId} ← Sawa9ly ${sawa9lyId}`
    );
}


/* =========================================================
   MARK MISSING AUTOMATED PRODUCTS
========================================================= */

if (
    fullCatalogCanBeVerified
) {

    console.log(
        "\n🔎 Full catalog verification: SAFE"
    );

    console.log(
        `📦 Discovered: ${uniqueDiscoveredLinks.length}`
    );

    console.log(
        `📥 Scraped successfully: ${products.length}`
    );


    /*
       We need to inspect all current product blocks.
    */

    const allBlocksRegex =
        /^\s*["']([^"']+)["']\s*:\s*\{[\s\S]*?^\s*\},?/gm;


    const blocksToCheck = [];

    let blockMatch;


    while (
        (blockMatch =
            allBlocksRegex.exec(
                current
            ))
    ) {

        blocksToCheck.push({
            id:
                blockMatch[1],
            block:
                blockMatch[0]
        });
    }


    /*
       Process blocks from the end toward the beginning
       so replacing one block never invalidates the
       position of blocks that still need processing.
    */

    for (
        let index =
            blocksToCheck.length - 1;
        index >= 0;
        index--
    ) {

        const item =
            blocksToCheck[index];


        /*
           Only automated products are controlled
           by the Sawa9ly synchronization.
        */

        if (
            !isAutomatedBlock(
                item.block
            )
        ) {

            continue;
        }


        const sawa9lyId =
            extractSawa9lyId(
                item.block
            );


        if (
            !sawa9lyId
        ) {

            continue;
        }


        /*
           Product was found in the complete scan.
           It is already handled above and therefore
           should remain available.
        */

        if (
            scrapedSawa9lyIds.has(
                sawa9lyId
            )
        ) {

            continue;
        }


        /*
           Product was NOT found in the complete catalog.
           Mark it unavailable instead of deleting it.
        */

        const freshBlock =
            findProductBlock(
                current,
                sawa9lyId
            );


        if (
            !freshBlock
        ) {

            continue;
        }


        const alreadyUnavailable =
            /available\s*:\s*false/.test(
                freshBlock.block
            );


        const updatedBlock =
            setAvailability(
                freshBlock.block,
                false
            );


        current =
            current.slice(
                0,
                freshBlock.start
            ) +
            updatedBlock +
            current.slice(
                freshBlock.end
            );


        if (
            !alreadyUnavailable
        ) {

            unavailableCount++;

            console.log(
                `🔴 Unavailable product ${freshBlock.id} ← Sawa9ly ${sawa9lyId}`
            );
        }
    }

} else {

    console.log(
        "\n🛡️ Availability protection: ENABLED"
    );

    console.log(
        "⚠️ الفحص الحالي غير كافٍ لتحديد المنتجات غير المتوفرة."
    );

    console.log(
        "⚠️ لن يتم تغيير أي منتج إلى available: false."
    );
}


/* =========================================================
   WRITE PRODUCTS.JS
========================================================= */

if (
    addedCount === 0 &&
    updatedCount === 0 &&
    unavailableCount === 0
) {

    console.log(
        "\nℹ️ لا توجد تغييرات على المنتجات."
    );


    if (
        skippedCount > 0
    ) {

        console.log(
            `⚠️ Skipped: ${skippedCount}`
        );
    }


    process.exit(0);
}


fs.writeFileSync(
    productsFile,
    current,
    "utf8"
);


/* =========================================================
   SUMMARY
========================================================= */

console.log(
    "\n======================================"
);

console.log(
    "       PRIX CHOC PRODUCT SYNC"
);

console.log(
    "======================================"
);

console.log(
    `➕ Added: ${addedCount}`
);

console.log(
    `🔄 Updated: ${updatedCount}`
);

console.log(
    `🟢 Restored: ${restoredCount}`
);

console.log(
    `🔴 Unavailable: ${unavailableCount}`
);

console.log(
    `⚠️ Skipped: ${skippedCount}`
);

console.log(
    `📦 Total processed: ${products.length}`
);

console.log(
    `🔍 Discovered links: ${uniqueDiscoveredLinks.length}`
);

console.log(
    `🛡️ Full availability verification: ${
        fullCatalogCanBeVerified
            ? "YES"
            : "NO"
    }`
);

console.log(
    `📄 Updated: ${productsFile}`
);

console.log(
    "======================================\n"
);
