import fs from "fs";
import path from "path";

import { config } from "./config.js";

/* =========================================================
   FILES
========================================================= */

const rawFile = path.resolve("./output/products.raw.json");
const linksFile = path.resolve("./debug/product-links.json");
const reportFile = path.resolve("./debug/discovery-report.json");
const productsFile = config.paths.productsFile;

/* =========================================================
   CHECK FILES
========================================================= */

for (const [file, message] of [
    [rawFile, "❌ products.raw.json غير موجود."],
    [linksFile, "❌ product-links.json غير موجود."],
    [reportFile, "❌ discovery-report.json غير موجود."],
    [productsFile, `❌ products.js غير موجود: ${productsFile}`]
]) {
    if (!fs.existsSync(file)) {
        console.error(message);
        process.exit(1);
    }
}

/* =========================================================
   LOAD DATA
========================================================= */

let products;
let discoveredLinks;
let discoveryReport;
let current;

try {
    products = JSON.parse(fs.readFileSync(rawFile, "utf8"));
    discoveredLinks = JSON.parse(fs.readFileSync(linksFile, "utf8"));
    discoveryReport = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    current = fs.readFileSync(productsFile, "utf8");
} catch (error) {
    console.error("❌ فشل قراءة ملفات المزامنة.");
    console.error(error?.message || error);
    process.exit(1);
}

if (!Array.isArray(products)) {
    console.error("❌ products.raw.json يجب أن يكون Array.");
    process.exit(1);
}

if (!Array.isArray(discoveredLinks)) {
    console.error("❌ product-links.json يجب أن يكون Array.");
    process.exit(1);
}

/* =========================================================
   DISCOVERY SAFETY
========================================================= */

if (discoveryReport?.complete !== true) {
    console.error("🛑 Discovery report غير مكتمل.");
    console.error("⚠️ لن يتم تغيير availability.");
    process.exit(1);
}

const discoveryComplete = Boolean(
    discoveryReport.complete === true &&
    discoveryReport.availabilitySafe === true &&
    Number(discoveryReport.pagesScanned) > 0 &&
    Number(discoveryReport.productsFound) > 0
);

if (!discoveryComplete) {
    console.log("");
    console.log("🛡️ Availability safety: NOT VERIFIED.");
    console.log("⚠️ لن يتم تحويل أي منتج إلى unavailable.");
} else {
    console.log("");
    console.log("🛡️ Discovery integrity verified.");
}

/* =========================================================
   HELPERS
========================================================= */

function escapeString(value) {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, " ");
}

function extractSawa9lyId(value) {
    if (!value) return "";

    const match = String(value).match(/\/product\/(\d+)/i);
    return match ? match[1] : "";
}

function normalizeProductLinks(items) {
    return [
        ...new Map(
            items
                .map(item => {
                    if (typeof item === "string") {
                        return { href: item };
                    }

                    return {
                        href: item?.href || ""
                    };
                })
                .map(item => ({
                    ...item,
                    href: String(item.href || "").trim()
                }))
                .filter(
                    item =>
                        item.href &&
                        /\/product\/\d+/i.test(item.href)
                )
                .map(item => [
                    extractSawa9lyId(item.href),
                    item
                ])
                .filter(([id]) => Boolean(id))
        ).values()
    ];
}

function extractExistingIds(content) {
    const ids = [];
    const regex = /["']([^"']+)["']\s*:\s*\{/g;

    let match;

    while ((match = regex.exec(content))) {
        ids.push(match[1]);
    }

    return ids;
}

function getNextLocalId(existingIds) {
    let max = 0;

    for (const id of existingIds) {
        if (/^\d+$/.test(id)) {
            max = Math.max(max, Number(id));
        }
    }

    return String(max + 1);
}

function findProductBlock(content, sawa9lyId) {
    if (!sawa9lyId) return null;

    const regex =
        /^\s*["']([^"']+)["']\s*:\s*\{[\s\S]*?^\s*\},?/gm;

    let match;

    while ((match = regex.exec(content))) {
        const block = match[0];
        const blockId = match[1];
        const blockSawa9lyId = extractSawa9lyId(block);

        if (blockSawa9lyId === String(sawa9lyId)) {
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

function isAutomatedBlock(block) {
    return /automated:\s*true/.test(block);
}

function getAvailability(block) {
    const match = block.match(
        /available:\s*(true|false)/
    );

    if (!match) return true;

    return match[1] === "true";
}

function setAvailability(block, available) {
    const value = available ? "true" : "false";

    if (/available:\s*(true|false)/.test(block)) {
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

function buildProductObject(product) {
    const images = Array.isArray(product.images)
        ? [
              ...new Set(
                  product.images
                      .filter(Boolean)
                      .map(image => escapeString(image))
              )
          ]
        : [];

    const primaryImage =
        escapeString(product.image || images[0] || "");

    const imagesCode =
        images.length > 0
            ? `[\n${images
                  .map(image => `            "${image}"`)
                  .join(",\n")}\n        ]`
            : "[]";

    return `{
        name: "${escapeString(product.name)}",
        description: "${escapeString(product.description)}",
        price: ${Number(product.sellingPrice || 0)},
        image: "${primaryImage}",
        images: ${imagesCode},
        sawa9lyLink: "${escapeString(product.sawa9lyLink)}",
        basePrice: ${Number(product.basePrice || 0)},
        profit: ${Number(product.profit || 0)},
        automated: true,
        available: true,
        updatedAt: "${escapeString(
            product.scrapedAt || new Date().toISOString()
        )}"
    }`;
}

function isCompleteProduct(product) {
    return Boolean(
        product &&
        product.sawa9lyId &&
        product.name &&
        product.image &&
        product.basePrice
    );
}

/* =========================================================
   DISCOVERED CATALOG
========================================================= */

const productLinks = normalizeProductLinks(discoveredLinks);

const discoveredIds = new Set(
    productLinks
        .map(item => extractSawa9lyId(item.href))
        .filter(Boolean)
);

const confirmedMissingIds = new Set(
    Array.isArray(discoveryReport.confirmedMissingIds)
        ? discoveryReport.confirmedMissingIds.map(String)
        : []
);

console.log(
    `🔗 Discovered Sawa9ly products: ${discoveredIds.size}`
);
console.log(
    `🔴 Confirmed missing after consecutive scans: ${confirmedMissingIds.size}`
);

/* =========================================================
   INITIAL DATA
========================================================= */

let existingIds = extractExistingIds(current);

let addedCount = 0;
let updatedCount = 0;
let restoredCount = 0;
let unavailableCount = 0;
let skippedCount = 0;

const scrapedIds = new Set();

/* =========================================================
   PROCESS NEW SCRAPED PRODUCTS
========================================================= */

for (const product of products) {
    if (!isCompleteProduct(product)) {
        console.log(
            `⚠️ Skipped incomplete product: ${
                product?.sawa9lyId || "unknown"
            }`
        );
        skippedCount++;
        continue;
    }

    const sawa9lyId = String(product.sawa9lyId);
    scrapedIds.add(sawa9lyId);

    const existing = findProductBlock(
        current,
        sawa9lyId
    );

    if (existing) {
        const wasAvailable = getAvailability(existing.block);

        const newBlock =
            `"${existing.id}": ${buildProductObject(product)},`;

        current =
            current.slice(0, existing.start) +
            newBlock +
            current.slice(existing.end);

        updatedCount++;

        if (!wasAvailable) {
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

    let localId;

    while (true) {
        localId = getNextLocalId(existingIds);

        if (!existingIds.includes(localId)) {
            break;
        }

        existingIds.push(localId);
    }

    existingIds.push(localId);

    const insertPosition = current.lastIndexOf("};");

    if (insertPosition === -1) {
        console.error(
            "❌ لم أجد نهاية storeData في products.js"
        );
        process.exit(1);
    }

    const beforeInsert = current.slice(0, insertPosition);
    const afterInsert = current.slice(insertPosition);

    const normalizedBeforeInsert =
        beforeInsert.trimEnd().endsWith(",")
            ? beforeInsert
            : beforeInsert.trimEnd() + ",\n";

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
   RESTORE PRODUCTS SEEN AGAIN BY DISCOVERY
========================================================= */

{
    const regex =
        /^\s*["']([^"']+)["']\s*:\s*\{[\s\S]*?^\s*\},?/gm;

    const blocks = [];
    let match;

    while ((match = regex.exec(current))) {
        blocks.push({
            id: match[1],
            block: match[0],
            start: match.index,
            end: regex.lastIndex
        });
    }

    for (let i = blocks.length - 1; i >= 0; i--) {
        const item = blocks[i];

        if (!isAutomatedBlock(item.block)) continue;

        const sawa9lyId = extractSawa9lyId(item.block);

        if (!sawa9lyId || !discoveredIds.has(sawa9lyId)) {
            continue;
        }

        if (scrapedIds.has(sawa9lyId)) {
            continue;
        }

        if (!getAvailability(item.block)) {
            const newBlock = setAvailability(
                item.block,
                true
            );

            current =
                current.slice(0, item.start) +
                newBlock +
                current.slice(item.end);

            restoredCount++;

            console.log(
                `🟢 Restored product ${item.id} ← discovered again Sawa9ly ${sawa9lyId}`
            );
        }
    }
}

/* =========================================================
   MARK CONFIRMED MISSING PRODUCTS UNAVAILABLE
========================================================= */

if (discoveryComplete && confirmedMissingIds.size > 0) {
    const regex =
        /^\s*["']([^"']+)["']\s*:\s*\{[\s\S]*?^\s*\},?/gm;

    const blocks = [];
    let match;

    while ((match = regex.exec(current))) {
        blocks.push({
            id: match[1],
            block: match[0],
            start: match.index,
            end: regex.lastIndex
        });
    }

    for (let i = blocks.length - 1; i >= 0; i--) {
        const item = blocks[i];

        if (!isAutomatedBlock(item.block)) continue;

        const sawa9lyId = extractSawa9lyId(item.block);

        if (
            !sawa9lyId ||
            !confirmedMissingIds.has(sawa9lyId)
        ) {
            continue;
        }

        if (discoveredIds.has(sawa9lyId)) {
            continue;
        }

        if (!getAvailability(item.block)) {
            continue;
        }

        const newBlock = setAvailability(
            item.block,
            false
        );

        current =
            current.slice(0, item.start) +
            newBlock +
            current.slice(item.end);

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
    restoredCount > 0 ||
    unavailableCount > 0;

console.log("");
console.log("======================================");
console.log("       PRIX CHOC PRODUCT SYNC");
console.log("======================================");
console.log(`➕ Added: ${addedCount}`);
console.log(`🔄 Updated: ${updatedCount}`);
console.log(`🟢 Restored: ${restoredCount}`);
console.log(`🔴 Unavailable: ${unavailableCount}`);
console.log(`⚠️ Skipped: ${skippedCount}`);
console.log(`📦 Total scraped: ${products.length}`);
console.log(`🔗 Discovered: ${discoveredIds.size}`);
console.log(`🛡️ Availability verified: ${discoveryComplete ? "YES" : "NO"}`);
console.log("======================================");

if (!hasChanges) {
    console.log("ℹ️ لا توجد تغييرات على المنتجات.");
    process.exit(0);
}

fs.writeFileSync(productsFile, current, "utf8");

console.log(`📄 Updated: ${productsFile}`);
console.log("");
