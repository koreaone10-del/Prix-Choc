import fs from "fs";
import path from "path";

import { config } from "./config.js";

const rawFile =
    path.resolve(
        "./output/products.raw.json"
    );

if (!fs.existsSync(rawFile)) {
    console.error(
        "❌ products.raw.json غير موجود."
    );

    console.error(
        "شغّل أولاً: npm run scrape"
    );

    process.exit(1);
}

const products =
    JSON.parse(
        fs.readFileSync(
            rawFile,
            "utf8"
        )
    );

const productsFile =
    config.paths.productsFile;

if (!fs.existsSync(productsFile)) {
    console.error(
        `❌ products.js غير موجود: ${productsFile}`
    );

    process.exit(1);
}

const current =
    fs.readFileSync(
        productsFile,
        "utf8"
    );

function escapeString(value) {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, " ");
}

function extractExistingIds(content) {
    const ids = [];

    const regex =
        /["']([^"']+)["']\s*:\s*\{/g;

    let match;

    while (
        (match = regex.exec(content))
    ) {
        ids.push(match[1]);
    }

    return ids;
}

function getNextLocalId(existingIds) {
    let max = 0;

    for (
        const id of existingIds
    ) {
        if (
            /^\d+$/.test(id)
        ) {
            max = Math.max(
                max,
                Number(id)
            );
        }
    }

    return String(max + 1);
}

function findProductBySawa9lyId(
    content,
    sawa9lyId
) {
    if (!sawa9lyId) {
        return null;
    }

    const pattern =
        new RegExp(
            `sawa9ly\\.app\\/product\\/${sawa9lyId}(?:["'\\\\])`,
            "i"
        );

    return pattern.test(content);
}

function buildProductObject(product) {
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

const existingIds =
    extractExistingIds(current);

let updatedContent =
    current;

const additions = [];

for (
    const product of products
) {
    if (
        !product.sawa9lyId ||
        !product.name ||
        !product.image ||
        !product.basePrice
    ) {
        console.log(
            `⚠️ Skipped incomplete product: ${product.sawa9lyId}`
        );

        continue;
    }

    const alreadyExists =
        findProductBySawa9lyId(
            updatedContent,
            product.sawa9lyId
        );

    if (alreadyExists) {
        console.log(
            `↪️ Existing Sawa9ly product: ${product.sawa9lyId}`
        );

        continue;
    }

    const localId =
        getNextLocalId(
            existingIds.concat(
                additions.map(
                    x => x.id
                )
            )
        );

    const block =
        `    "${localId}": ${buildProductObject(product)},\n`;

    additions.push({
        id: localId,
        product
    });

    console.log(
        `➕ New product ${localId} ← Sawa9ly ${product.sawa9lyId}`
    );
}

if (
    additions.length === 0
) {
    console.log(
        "\nℹ️ لا توجد منتجات جديدة لإضافتها."
    );

    process.exit(0);
}

const insertPosition =
    updatedContent.lastIndexOf("};");

if (
    insertPosition === -1
) {
    console.error(
        "❌ لم أجد نهاية storeData في products.js"
    );

    process.exit(1);
}

const additionText =
    "\n" +
    additions
        .map(
            item =>
                `    "${item.id}": ${buildProductObject(item.product)},`
        )
        .join("\n") +
    "\n";

updatedContent =
    updatedContent.slice(
        0,
        insertPosition
    ) +
    additionText +
    updatedContent.slice(
        insertPosition
    );

fs.writeFileSync(
    productsFile,
    updatedContent,
    "utf8"
);

console.log("\n======================================");

console.log(
    `✅ Added ${additions.length} new products`
);

console.log(
    `📄 Updated: ${productsFile}`
);

console.log("======================================\n");
