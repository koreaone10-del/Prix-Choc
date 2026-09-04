import fs from "fs";
import path from "path";

import { config } from "./config.js";

/* =========================================================
   FILES
========================================================= */

const rawFile = path.resolve(
    "./output/products.raw.json"
);

const linksFile = path.resolve(
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

if (!fs.existsSync(linksFile)) {
    console.error(
        "❌ product-links.json غير موجود."
    );

    console.error(
        "شغّل أولاً: npm run discover"
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

let products;

let discoveredLinks;

try {
    products = JSON.parse(
        fs.readFileSync(
            rawFile,
            "utf8"
        )
    );

    discoveredLinks = JSON.parse(
        fs.readFileSync(
            linksFile,
            "utf8"
        )
    );

} catch (error) {

    console.error(
        "❌ فشل قراءة ملفات البيانات."
    );

    console.error(
        error.message
    );

    process.exit(1);
}


if (!Array.isArray(products)) {

    console.error(
        "❌ products.raw.json يجب أن يكون Array."
    );

    process.exit(1);
}

if (!Array.isArray(discoveredLinks)) {

    console.error(
        "❌ product-links.json يجب أن يكون Array."
    );

    process.exit(1);
}


let current =
    fs.readFileSync(
        productsFile,
        "utf8"
    );


/* =========================================================
   HELPERS
========================================================= */

function escapeString(value) {

    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, " ");
}


/* =========================================================
   EXTRACT SAWA9LY ID
========================================================= */

function extractSawa9lyId(value) {

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
   NORMALIZE DISCOVERED LINKS
========================================================= */

const productLinks = [
    ...new Map(

        discoveredLinks

            .map(item => {

                if (
                    typeof item ===
                    "string"
                ) {
                    return {
                        href: item
                    };
                }

                return {
                    href:
                        item?.href ||
                        ""
                };
            })

            .filter(item =>
                item.href &&
                /\/product\/\d+/i.test(
                    item.href
                )
            )

            .map(item => [
                item.href,
                item
            ])

    ).values()
];


const discoveredIds =
    new Set(
        productLinks
            .map(item =>
                extractSawa9lyId(
                    item.href
                )
            )
            .filter(Boolean)
    );


console.log("");
console.log(
    `🔗 Discovered Sawa9ly products: ${discoveredIds.size}`
);


/* =========================================================
   APPLY SCRAPE LIMIT
========================================================= */

const scrapeLimit =
    Number(
        config.automation?.scrapeLimit ||
        productLinks.length
    );


const limitedLinks =
    productLinks.slice(
        0,
        scrapeLimit
    );


const selectedIds =
    new Set(
        limitedLinks
            .map(item =>
                extractSawa9lyId(
                    item.href
                )
            )
            .filter(Boolean)
    );


console.log(
    `🛍️ Selected for scraping: ${selectedIds.size}`
);


/* =========================================================
   FULL SCAN SAFETY
========================================================= */

/*
   We ONLY mark old products unavailable when:

   1. Discovery found products.
   2. scrapeLimit covers the entire discovered catalog.
   3. Every discovered ID is selected.
   4. Every selected ID was successfully scraped.
   5. There are no duplicate/missing scraped IDs.

   This prevents temporary network failures
   from hiding products.
*/

const discoveryComplete =
    discoveredIds.size > 0 &&
    selectedIds.size ===
        discoveredIds.size;


if (!discoveryComplete) {

    console.log("");
    console.log(
        "🛡️ Availability safety: FULL SCAN NOT VERIFIED."
    );

    console.log(
        "⚠️ لن يتم تحويل أي منتج قديم إلى unavailable."
    );

} else {

    console.log("");
    console.log(
        "🛡️ Availability safety: FULL SCAN candidate verified."
    );
}


/* =========================================================
   FIND EXISTING LOCAL IDS
========================================================= */

function extractExistingIds(
    content
) {

    const ids = [];

    const regex =
        /["']([^"']+)["']\s*:\s*\{/g;

    let match;

    while (
        (match =
            regex.exec(content))
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
        (match =
            regex.exec(content))
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
                block: block,
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

    return /automated:\s*true/.test(
        block
    );
}


/* =========================================================
   GET AVAILABILITY
========================================================= */

function getAvailability(
    block
) {

    const match =
        block.match(
            /available:\s*(true|false)/
        );

    if (!match) {
        return true;
    }

    return match[1] === "true";
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


    if (
        /available:\s*(true|false)/.test(
            block
        )
    ) {

        return block.replace(
            /available:\s*(true|false)/,
            `available: ${value}`
        );
    }


    return block.replace(
        /(\{\s*)/,
        `$1\n        available: ${value},`
    );
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

let existingIds =
    extractExistingIds(
        current
    );


let addedCount = 0;
let updatedCount = 0;
let restoredCount = 0;
let unavailableCount = 0;
let skippedCount = 0;


/*
   IDs successfully scraped.
*/
const scrapedIds =
    new Set();


/* =========================================================
   PROCESS SCRAPED PRODUCTS
========================================================= */

for (
    const product of products
) {

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


    scrapedIds.add(
        sawa9lyId
    );


    /* =====================================================
       FIND EXISTING PRODUCT
    ===================================================== */

    const existing =
        findProductBlock(
            current,
            sawa9lyId
        );


    /* =====================================================
       UPDATE EXISTING
    ===================================================== */

    if (existing) {

        const wasAvailable =
            getAvailability(
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
            !wasAvailable
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

    let localId;

    while (true) {

        localId =
            getNextLocalId(
                existingIds
            );

        if (
            !existingIds.includes(
                localId
            )
        ) {
            break;
        }

        existingIds.push(
            localId
        );
    }


    existingIds.push(
        localId
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
   VERIFY COMPLETE SCRAPE
========================================================= */

const scrapeComplete =
    discoveryComplete &&
    scrapedIds.size ===
        selectedIds.size &&
    [...selectedIds].every(
        id =>
            scrapedIds.has(id)
    );


console.log("");

if (scrapeComplete) {

    console.log(
        "✅ COMPLETE CATALOG SCRAPE VERIFIED."
    );

} else {

    console.log(
        "🛡️ COMPLETE CATALOG SCRAPE NOT VERIFIED."
    );

    console.log(
        "⚠️ No existing product will be marked unavailable."
    );
}


/* =========================================================
   MARK MISSING AUTOMATED PRODUCTS UNAVAILABLE
========================================================= */

if (
    scrapeComplete
) {

    const regex =
        /^\s*["']([^"']+)["']\s*:\s*\{[\s\S]*?^\s*\},?/gm;


    const blocks = [];

    let match;


    while (
        (match =
            regex.exec(current))
    ) {

        blocks.push({
            id: match[1],
            block: match[0],
            start: match.index,
            end: regex.lastIndex
        });
    }


    /*
       Process backwards so positions
       remain valid while replacing blocks.
    */

    for (
        let i = blocks.length - 1;
        i >= 0;
        i--
    ) {

        const item =
            blocks[i];


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


        if (!sawa9lyId) {
            continue;
        }


        /*
           Product exists in the current
           Sawa9ly catalog.
        */

        if (
            scrapedIds.has(
                sawa9lyId
            )
        ) {
            continue;
        }


        /*
           Product no longer exists
           in the successfully scraped catalog.
        */

        const wasAvailable =
            getAvailability(
                item.block
            );


        if (
            !wasAvailable
        ) {
            continue;
        }


        const newBlock =
            setAvailability(
                item.block,
                false
            );


        current =
            current.slice(
                0,
                item.start
            ) +
            newBlock +
            current.slice(
                item.end
            );


        unavailableCount++;


        console.log(
            `🔴 Product ${item.id} ← Sawa9ly ${sawa9lyId} marked unavailable`
        );
    }
}


/* =========================================================
   WRITE PRODUCTS.JS
========================================================= */

const hasChanges =
    addedCount > 0 ||
    updatedCount > 0 ||
    unavailableCount > 0;


if (!hasChanges) {

    console.log("");
    console.log(
        "ℹ️ لا توجد تغييرات على المنتجات."
    );

    console.log(
        `⚠️ Skipped: ${skippedCount}`
    );

    console.log(
        `📦 Total scraped: ${products.length}`
    );

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

console.log("");

console.log(
    "======================================"
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
    `📦 Total scraped: ${products.length}`
);

console.log(
    `🔗 Discovered: ${discoveredIds.size}`
);

console.log(
    `📄 Updated: ${productsFile}`
);

console.log(
    "======================================"
);

console.log("");
