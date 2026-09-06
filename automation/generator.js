import fs from "fs";
import path from "path";
import { config } from "./config.js";

const rawFile = path.resolve("./output/products.raw.json");
const linksFile = path.resolve("./debug/product-links.json");
const reportFile = path.resolve("./debug/discovery-report.json");
const scraperReportFile = path.resolve("./debug/scraper-debug.json");
const productsFile = config.paths.productsFile;

for (const [file, message] of [
    [rawFile, "❌ products.raw.json غير موجود."],
    [linksFile, "❌ product-links.json غير موجود."],
    [reportFile, "❌ discovery-report.json غير موجود."],
    [productsFile, "❌ products.js غير موجود."]
]) {
    if (!fs.existsSync(file)) {
        console.error(message);
        process.exit(1);
    }
}

const products = JSON.parse(
    fs.readFileSync(rawFile, "utf8")
);
const discoveredLinks = JSON.parse(
    fs.readFileSync(linksFile, "utf8")
);
const discoveryReport = JSON.parse(
    fs.readFileSync(reportFile, "utf8")
);
const scraperReport = fs.existsSync(scraperReportFile)
    ? JSON.parse(fs.readFileSync(scraperReportFile, "utf8"))
    : null;

if (!Array.isArray(products) || !Array.isArray(discoveredLinks)) {
    console.error("❌ بيانات المزامنة غير صالحة.");
    process.exit(1);
}

if (
    discoveryReport.complete !== true ||
    discoveryReport.availabilitySafe !== true
) {
    console.error(
        "🛑 Discovery غير مكتمل/غير آمن. تم إيقاف availability update."
    );
    process.exit(1);
}

const discoveredIds = new Set(
    discoveredLinks
        .map(item =>
            typeof item === "string"
                ? item
                : item?.href
        )
        .map(value => {
            const match = String(value || "").match(
                /\/(?:store|product)\/(\d+)/i
            );
            return match ? match[1] : "";
        })
        .filter(Boolean)
);

const confirmedMissingIds = new Set(
    Array.isArray(discoveryReport.confirmedMissingIds)
        ? discoveryReport.confirmedMissingIds.map(String)
        : []
);

function escapeString(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, " ");
}

function extractSawa9lyId(value) {
    const match = String(value || "").match(
        /\/(?:store|product)\/(\d+)/i
    );
    return match ? match[1] : "";
}

function isAutomatedBlock(block) {
    return /automated:\s*true/.test(block);
}

function getAvailability(block) {
    const match = block.match(
        /available:\s*(true|false)/
    );
    return match ? match[1] === "true" : true;
}

function setAvailability(block, available) {
    if (/available:\s*(true|false)/.test(block)) {
        return block.replace(
            /available:\s*(true|false)/,
            `available: ${available ? "true" : "false"}`
        );
    }

    return block.replace(
        /(\{\s*)/,
        `$1\n        available: ${available ? "true" : "false"},`
    );
}

function buildProductObject(product, existingBlock = "") {
    const images = [
        ...new Set(
            (Array.isArray(product.images)
                ? product.images
                : [product.image]
            )
                .filter(Boolean)
                .map(String)
        )
    ];

    const primaryImage =
        images[0] ||
        String(product.image || "");

    return `{
        name: "${escapeString(product.name)}",
        description: "${escapeString(product.description)}",
        price: ${Number(product.sellingPrice || 0)},
        image: "${escapeString(primaryImage)}",
        images: [
${images.map(image => `            "${escapeString(image)}"`).join(",\n")}
        ],
        sawa9lyLink: "${escapeString(product.sawa9lyLink)}",
        basePrice: ${Number(product.basePrice || 0)},
        profit: ${Number(product.profit || 0)},
        automated: true,
        available: ${getAvailability(existingBlock) ? "true" : "true"},
        updatedAt: "${escapeString(product.scrapedAt || new Date().toISOString())}"
    }`;
}

function findBlocks(content) {
    const regex =
        /^\s*["']([^"']+)["']\s*:\s*\{[\s\S]*?^\s*\},?/gm;

    const blocks = [];
    let match;

    while ((match = regex.exec(content))) {
        blocks.push({
            id: match[1],
            block: match[0],
            start: match.index,
            end: regex.lastIndex
        });
    }

    return blocks;
}

function findProductBlock(content, sawa9lyId) {
    for (const item of findBlocks(content)) {
        if (
            isAutomatedBlock(item.block) &&
            extractSawa9lyId(item.block) ===
                String(sawa9lyId)
        ) {
            return item;
        }
    }

    return null;
}

function extractExistingLocalIds(content) {
    return findBlocks(content).map(item => item.id);
}

function nextLocalId(existingIds) {
    let max = 0;

    for (const id of existingIds) {
        if (/^\d+$/.test(id)) {
            max = Math.max(max, Number(id));
        }
    }

    return String(max + 1);
}

function isValidScrapedProduct(product) {
    return Boolean(
        product &&
        product.sawa9lyId &&
        product.name &&
        product.image &&
        Number(product.basePrice) > 0 &&
        product.sawa9lyLink
    );
}

let current = fs.readFileSync(
    productsFile,
    "utf8"
);

let existingIds =
    extractExistingLocalIds(current);

let added = 0;
let updated = 0;
let restored = 0;
let unavailable = 0;
let skipped = 0;

for (const product of products) {
    if (!isValidScrapedProduct(product)) {
        skipped++;
        continue;
    }

    const sawa9lyId = String(product.sawa9lyId);
    const existing = findProductBlock(
        current,
        sawa9lyId
    );

    if (existing) {
        const wasAvailable =
            getAvailability(existing.block);

        const replacement =
            `"${existing.id}": ${buildProductObject(
                product,
                existing.block
            )},`;

        current =
            current.slice(0, existing.start) +
            replacement +
            current.slice(existing.end);

        updated++;

        if (!wasAvailable) {
            restored++;
        }

        continue;
    }

    let localId = nextLocalId(existingIds);
    while (existingIds.includes(localId)) {
        existingIds.push(localId);
        localId = nextLocalId(existingIds);
    }

    existingIds.push(localId);

    const insertPosition = current.lastIndexOf("};");

    if (insertPosition === -1) {
        console.error(
            "❌ لم أجد نهاية storeData في products.js."
        );
        process.exit(1);
    }

    const before = current
        .slice(0, insertPosition)
        .trimEnd();

    const after = current.slice(insertPosition);

    const separator = before.endsWith(",")
        ? "\n"
        : ",\n";

    current =
        before +
        separator +
        `    "${localId}": ${buildProductObject(product)},\n` +
        after;

    added++;
}

/*
 * Availability is only changed after a complete discovery.
 * A failed individual scrape NEVER deletes or disables the
 * old product data.
 */
if (
    discoveryReport.availabilitySafe === true &&
    confirmedMissingIds.size > 0
) {
    const blocks = findBlocks(current);

    for (let i = blocks.length - 1; i >= 0; i--) {
        const item = blocks[i];

        if (!isAutomatedBlock(item.block)) continue;

        const sawa9lyId =
            extractSawa9lyId(item.block);

        if (
            !sawa9lyId ||
            !confirmedMissingIds.has(sawa9lyId) ||
            discoveredIds.has(sawa9lyId) ||
            !getAvailability(item.block)
        ) {
            continue;
        }

        const replacement =
            setAvailability(
                item.block,
                false
            );

        current =
            current.slice(0, item.start) +
            replacement +
            current.slice(item.end);

        unavailable++;
    }
}

if (scraperReport) {
    const coverage =
        Number(scraperReport.coverage || 0);

    if (
        coverage < 0.5 &&
        confirmedMissingIds.size > 0
    ) {
        console.log(
            "⚠️ Scraper coverage below 50%; no newly missing products are disabled."
        );

        /*
         * Restore availability for blocks changed in this run
         * only is deliberately avoided. Since availability changes
         * above are based on two successful discovery runs, this
         * guard mainly documents the policy. The normal workflow
         * should use full scraping.
         */
    }
}

const changed =
    added ||
    updated ||
    restored ||
    unavailable;

console.log("======================================");
console.log(" PRIX CHOC PRODUCT SYNC");
console.log("======================================");
console.log(`Added:       ${added}`);
console.log(`Updated:     ${updated}`);
console.log(`Restored:    ${restored}`);
console.log(`Unavailable: ${unavailable}`);
console.log(`Skipped:     ${skipped}`);
console.log(`Scraped:     ${products.length}`);
console.log(`Discovered:  ${discoveredIds.size}`);
console.log("======================================");

if (!changed) {
    console.log("ℹ️ لا توجد تغييرات.");
    process.exit(0);
}

fs.writeFileSync(
    productsFile,
    current,
    "utf8"
);

console.log(`✅ Updated: ${productsFile}`);
