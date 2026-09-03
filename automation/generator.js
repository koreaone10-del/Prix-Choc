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
   HELPERS
========================================================= */

function escapeString(value) {

    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, " ");
}


/* =========================================================
   GET EXISTING LOCAL IDS
========================================================= */

function extractExistingIds(content) {

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


    /*
       Product blocks inside products.js are flat objects.

       Example:

       "41": {
           name: "...",
           price: 2500,
           image: "...",
           sawa9lyLink: "https://sawa9ly.app/product/5724",
           ...
       },
    */

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
   BUILD PRODUCT OBJECT
========================================================= */

function buildProductObject(
    product
) {

    return `{
        name: "${escapeString(product.name)}",
        price: ${Number(product.sellingPrice || 0)},
        image: "${escapeString(product.image)}",
        sawa9lyLink: "${escapeString(product.sawa9lyLink)}",
        basePrice: ${Number(product.basePrice || 0)},
        profit: ${Number(product.profit || 0)},
        automated: true,
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

let addedCount = 0;

let updatedCount = 0;

let skippedCount = 0;


/* =========================================================
   PROCESS PRODUCTS
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


        console.log(
            `🔄 Updated product ${existing.id} ← Sawa9ly ${sawa9lyId}`
        );


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
                        { length: addedCount },
                        (_, index) =>
                            String(
                                Number(
                                    getNextLocalId(
                                        existingIds
                                    )
                                ) + index
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
   WRITE PRODUCTS.JS
========================================================= */

if (
    addedCount === 0 &&
    updatedCount === 0
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
    `⚠️ Skipped: ${skippedCount}`
);

console.log(
    `📦 Total processed: ${products.length}`
);

console.log(
    `📄 Updated: ${productsFile}`
);

console.log(
    "======================================\n"
);
