import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

import { config, validateConfig } from "./config.js";
import {
  calculateSellingPrice,
  calculateProfit,
} from "./pricing.js";

validateConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productsFile = path.resolve(
  config.paths?.productsFile || path.join(__dirname, "../products.js")
);
const outputDir = path.resolve(
  config.paths?.outputDir || path.join(__dirname, "output")
);
const debugDir = path.resolve(
  config.paths?.debugDir || path.join(__dirname, "debug")
);

const rawProductsFile = path.join(outputDir, "products.raw.json");
const productLinksFile = path.join(debugDir, "product-links.json");
const discoveryReportFile = path.join(debugDir, "discovery-report.json");
const scraperReportFile = path.join(debugDir, "scraper-report.json");
const generatorReportFile = path.join(debugDir, "generator-report.json");
const backupProductsFile = path.join(
  debugDir,
  "products-before-generation.js"
);

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(debugDir, { recursive: true });

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function normalizeId(value) {
  if (value === undefined || value === null) return "";
  const match = String(value).trim().match(/\d+/);
  return match ? match[0] : "";
}

function productIdFromUrl(value) {
  const text = String(value || "");
  const match = text.match(/\/(?:store|product)\/(\d+)/i);
  return match ? match[1] : "";
}

function normalizeSawa9lyLink(value, id) {
  const raw = String(value || "").trim();
  if (raw) {
    const found = productIdFromUrl(raw);
    if (found) {
      return `https://affiliate.sawa9ly.pro/store/${found}`;
    }
  }
  return id ? `https://affiliate.sawa9ly.pro/store/${id}` : "";
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n < 100000000;
}

function isValidImage(value) {
  const text = String(value || "").trim();
  return Boolean(
    text &&
    !text.startsWith("data:") &&
    !text.startsWith("blob:") &&
    (/^https?:\/\//i.test(text) || text.startsWith("/"))
  );
}

function normalizeImages(product) {
  const result = [];
  const add = (value) => {
    if (!isValidImage(value)) return;
    const image = String(value).trim();
    if (!result.includes(image)) result.push(image);
  };

  add(product?.image);

  if (Array.isArray(product?.images)) {
    for (const image of product.images) add(image);
  }

  return result.slice(0, 20);
}

function loadRawProducts() {
  if (!fs.existsSync(rawProductsFile)) {
    throw new Error(`Missing scraper output: ${rawProductsFile}`);
  }

  const raw = readJson(rawProductsFile, null);
  if (!Array.isArray(raw)) {
    throw new Error("products.raw.json must contain an array.");
  }

  return raw;
}

function loadDiscoveryReport() {
  const report = readJson(discoveryReportFile, null);
  if (!report || typeof report !== "object") {
    throw new Error(`Missing or invalid discovery report: ${discoveryReportFile}`);
  }
  return report;
}

function loadScraperReport() {
  const report = readJson(scraperReportFile, null);
  if (!report || typeof report !== "object") {
    throw new Error(`Missing or invalid scraper report: ${scraperReportFile}`);
  }
  return report;
}

function loadDiscoveredIds(discoveryReport) {
  const ids = new Set();

  const add = (value) => {
    const id = normalizeId(value);
    if (id) ids.add(id);
  };

  if (Array.isArray(discoveryReport.discoveredIds)) {
    for (const id of discoveryReport.discoveredIds) add(id);
  }

  if (Array.isArray(discoveryReport.discovered)) {
    for (const item of discoveryReport.discovered) {
      if (typeof item === "string") add(productIdFromUrl(item) || item);
      else add(item?.sawa9lyId || productIdFromUrl(item?.href || item?.url));
    }
  }

  const links = readJson(productLinksFile, null);
  if (Array.isArray(links)) {
    for (const item of links) {
      if (typeof item === "string") add(productIdFromUrl(item) || item);
      else add(item?.sawa9lyId || productIdFromUrl(item?.href || item?.url));
    }
  }

  return ids;
}

function validateRunSafety(rawProducts, discoveredIds, discoveryReport, scraperReport) {
  if (discoveredIds.size === 0) {
    throw new Error("Safety stop: discovery returned zero product IDs.");
  }

  if (discoveryReport.complete !== true) {
    throw new Error("Safety stop: discovery report is not complete.");
  }

  if (discoveryReport.availabilitySafe !== true) {
    throw new Error("Safety stop: discovery is not availability-safe.");
  }

  if (scraperReport.safeToPublish === false) {
    throw new Error("Safety stop: scraper marked this run unsafe to publish.");
  }

  if (scraperReport.complete === false) {
    throw new Error("Safety stop: scraper report is incomplete.");
  }

  if (scraperReport.coverageSafe === false) {
    throw new Error("Safety stop: scraper coverage is below the configured safe threshold.");
  }

  if (scraperReport.fullCatalogSelected === false) {
    throw new Error("Safety stop: scraper did not process the full discovered catalog.");
  }

  const reportedScraped = Number(scraperReport.scraped || 0);
  if (reportedScraped > 0 && reportedScraped !== rawProducts.length) {
    throw new Error(
      `Safety stop: scraper report mismatch. Report=${reportedScraped}, raw=${rawProducts.length}.`
    );
  }

  if (rawProducts.length === 0) {
    throw new Error("Safety stop: scraper returned zero products.");
  }

  const coverage = Number(
    scraperReport.coveragePercent ??
    (Number(scraperReport.coverage || 0) * 100)
  );

  const minimum = Number(
    config.automation?.minimumCoveragePercent ?? 70
  );

  if (!Number.isFinite(coverage) || coverage < minimum) {
    throw new Error(
      `Safety stop: scraper coverage ${coverage.toFixed(2)}% is below ${minimum}%.`
    );
  }
}

function parseProductsSource(source) {
  const text = String(source || "");

  // Current Prix-Choc format:
  // const storeData = { ... };
  const storeMatch = text.match(
    /(?:const|let|var)\s+storeData\s*=\s*([\s\S]*?);\s*$/
  );

  if (storeMatch) {
    try {
      const sandbox = {};
      vm.runInNewContext(
        `globalThis.__value = ${storeMatch[1]};`,
        sandbox,
        { timeout: 3000 }
      );

      if (
        sandbox.__value &&
        typeof sandbox.__value === "object" &&
        !Array.isArray(sandbox.__value)
      ) {
        return { format: "storeData", data: sandbox.__value };
      }
    } catch (error) {
      throw new Error(
        `Could not parse current storeData products.js: ${error.message}`
      );
    }
  }

  // Compatibility with array-based versions.
  const arrayPatterns = [
    /export\s+default\s+(\[[\s\S]*\])\s*;?\s*$/,
    /(?:const|let|var)\s+products\s*=\s*(\[[\s\S]*\])\s*;?\s*(?:export\s+default\s+products\s*;?)?$/,
    /module\.exports\s*=\s*(\[[\s\S]*\])\s*;?\s*$/,
  ];

  for (const pattern of arrayPatterns) {
    const match = text.match(pattern);
    if (!match) continue;

    try {
      const sandbox = {};
      vm.runInNewContext(`globalThis.__value = ${match[1]};`, sandbox, {
        timeout: 3000,
      });

      if (Array.isArray(sandbox.__value)) {
        return { format: "array", data: sandbox.__value };
      }
    } catch {
      // Try next compatible format.
    }
  }

  throw new Error(
    "Could not safely parse products.js. Generation stopped to protect the database."
  );
}

function loadExistingProducts() {
  if (!fs.existsSync(productsFile)) {
    throw new Error(`products.js does not exist: ${productsFile}`);
  }

  const source = fs.readFileSync(productsFile, "utf8");
  return parseProductsSource(source);
}

function getProductId(product) {
  return normalizeId(
    product?.sawa9lyId ||
    product?.sawa9lyID ||
    productIdFromUrl(product?.sawa9lyLink)
  );
}

function buildRawMap(rawProducts) {
  const map = new Map();

  for (const raw of rawProducts) {
    const id = getProductId(raw);
    if (!id) continue;

    map.set(id, {
      ...raw,
      sawa9lyId: id,
    });
  }

  return map;
}

function normalizeScrapedProduct(raw) {
  const id = getProductId(raw);
  const images = normalizeImages(raw);

  const basePrice = Math.round(Number(raw?.basePrice ?? raw?.price));
  if (!id || !cleanText(raw?.name) || !isValidPrice(basePrice) || images.length === 0) {
    return null;
  }

  // Pricing is controlled centrally by pricing.js/config.js.
  // Never keep an old scraped selling price after the margin policy changes.
  const sellingPrice = calculateSellingPrice(basePrice);
  const profit = calculateProfit(basePrice, sellingPrice);

  return {
    sawa9lyId: id,
    name: cleanText(raw.name),
    description: cleanText(raw.description),
    price: sellingPrice,
    basePrice,
    sellingPrice,
    profit,
    image: images[0],
    images,
    sawa9lyLink: normalizeSawa9lyLink(raw.sawa9lyLink, id),
    automated: true,
    available: true,
    updatedAt: new Date().toISOString(),
  };
}

function isAutomated(product) {
  return Boolean(
    product?.automated === true ||
    getProductId(product) ||
    product?.sawa9lyLink
  );
}

function mergeExisting(existing, scraped) {
  const merged = {
    ...existing,
    ...scraped,
    sawa9lyId: scraped.sawa9lyId,
    name: scraped.name,
    description: scraped.description,
    price: scraped.sellingPrice,
    basePrice: scraped.basePrice,
    sellingPrice: scraped.sellingPrice,
    profit: scraped.profit,
    image: scraped.image,
    images: scraped.images,
    sawa9lyLink: scraped.sawa9lyLink,
    automated: true,
    available: true,
    updatedAt: new Date().toISOString(),
  };

  delete merged.unavailableSince;
  return merged;
}

function markUnavailable(product) {
  return {
    ...product,
    available: false,
    unavailableSince:
      product?.unavailableSince || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    automated: true,
  };
}

function mergeDatabase(existingData, rawProducts, confirmedMissingIds) {
  const rawMap = buildRawMap(rawProducts);
  const final = [];
  const existingIds = new Set();

  const stats = {
    total: 0,
    updated: 0,
    restored: 0,
    unavailable: 0,
    unchanged: 0,
    manual: 0,
    newProducts: 0,
    invalidScraped: 0,
  };

  // Existing products keep their order.
  for (const existingRaw of existingData) {
    const existing = { ...existingRaw };
    const id = getProductId(existing);

    if (!id) {
      final.push(existing);
      stats.manual++;
      continue;
    }

    existingIds.add(id);
    const raw = rawMap.get(id);

    if (raw) {
      const scraped = normalizeScrapedProduct(raw);

      if (!scraped) {
        final.push(existing);
        stats.unchanged++;
        stats.invalidScraped++;
        continue;
      }

      if (existing.available === false) stats.restored++;
      else stats.updated++;

      final.push(mergeExisting(existing, scraped));
      continue;
    }

    // A failed scrape alone never makes a product unavailable.
    if (confirmedMissingIds.has(id) && isAutomated(existing)) {
      if (existing.available !== false) stats.unavailable++;
      final.push(markUnavailable(existing));
    } else {
      final.push(existing);
      stats.unchanged++;
    }
  }

  // New Sawa9ly products are appended.
  for (const [id, raw] of rawMap) {
    if (existingIds.has(id)) continue;

    const scraped = normalizeScrapedProduct(raw);
    if (!scraped) {
      stats.invalidScraped++;
      continue;
    }

    final.push(scraped);
    stats.newProducts++;
  }

  stats.total = final.length;
  return { final, stats };
}

function validateFinal(existingData, finalData) {
  if (!Array.isArray(finalData) || finalData.length === 0) {
    throw new Error("Safety stop: final product database is empty.");
  }

  if (finalData.length < existingData.length) {
    throw new Error(
      `Safety stop: product count decreased from ${existingData.length} to ${finalData.length}.`
    );
  }

  const ids = new Set();

  for (const product of finalData) {
    if (!product || typeof product !== "object") {
      throw new Error("Safety stop: invalid product object detected.");
    }

    const id = getProductId(product);
    if (!id) continue;

    if (ids.has(id)) {
      throw new Error(`Safety stop: duplicate sawa9lyId ${id}.`);
    }

    ids.add(id);
  }

  // Automated products must have the fields required by the new frontend.
  for (const product of finalData) {
    if (!isAutomated(product)) continue;

    if (!getProductId(product)) {
      throw new Error("Safety stop: automated product without sawa9lyId.");
    }

    if (!Array.isArray(product.images) || product.images.length === 0) {
      throw new Error(
        `Safety stop: automated product ${getProductId(product)} has no images[].`
      );
    }

    if (typeof product.available !== "boolean") {
      throw new Error(
        `Safety stop: automated product ${getProductId(product)} has invalid available field.`
      );
    }
  }
}

function nextObjectKey(storeData) {
  let max = 0;

  for (const key of Object.keys(storeData)) {
    const n = Number(key);
    if (Number.isInteger(n) && n > max) max = n;
  }

  return String(max + 1);
}

function arrayToStoreData(array) {
  const object = {};
  let key = 1;

  for (const product of array) {
    object[String(key++)] = product;
  }

  return object;
}

function finalToStoreData(existingData, finalData) {
  const storeData = {};

  // Existing keys are preserved exactly where possible.
  const existingById = new Map();
  for (const [key, product] of Object.entries(existingData)) {
    const id = getProductId(product);
    if (id) existingById.set(id, key);
  }

  let nextKey = nextObjectKey(existingData);

  for (const product of finalData) {
    const id = getProductId(product);

    if (id && existingById.has(id)) {
      storeData[existingById.get(id)] = product;
    } else {
      storeData[nextKey++] = product;
    }
  }

  return storeData;
}

function buildProductsJs(format, existingData, finalData) {
  if (format === "array") {
    return `const products = ${JSON.stringify(finalData, null, 2)};\nexport default products;\n`;
  }

  const storeData = finalToStoreData(existingData, finalData);

  return `/*
 * PRIX CHOC
 * Sawa9ly automated product catalog
 *
 * Generated automatically.
 * Existing products are preserved.
 * Unavailable products are kept with available:false.
 */

const storeData = ${JSON.stringify(storeData, null, 2)};
`;
}

function createBackup() {
  if (!fs.existsSync(productsFile)) return false;

  fs.copyFileSync(productsFile, backupProductsFile);
  return true;
}

function atomicWrite(content) {
  const temp = `${productsFile}.tmp`;
  fs.writeFileSync(temp, content, "utf8");

  try {
    fs.renameSync(temp, productsFile);
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {}
    throw error;
  }
}

function validateWrittenFile(expectedCount, expectedFormat) {
  const source = fs.readFileSync(productsFile, "utf8");
  const parsed = parseProductsSource(source);

  const count =
    parsed.format === "storeData"
      ? Object.keys(parsed.data).length
      : parsed.data.length;

  if (count !== expectedCount) {
    throw new Error(
      `Post-write validation failed: expected ${expectedCount}, got ${count}.`
    );
  }

  if (expectedFormat === "storeData" && parsed.format !== "storeData") {
    throw new Error("Post-write validation failed: products.js format changed.");
  }

  return parsed;
}

function main() {
  console.log("\n==================================================");
  console.log(" PRIX CHOC - SAFE PRODUCT GENERATOR");
  console.log("==================================================\n");

  const rawProducts = loadRawProducts();
  const discoveryReport = loadDiscoveryReport();
  const scraperReport = loadScraperReport();
  const discoveredIds = loadDiscoveredIds(discoveryReport);

  validateRunSafety(
    rawProducts,
    discoveredIds,
    discoveryReport,
    scraperReport
  );

  const confirmedMissingIds = new Set(
    Array.isArray(discoveryReport.confirmedMissingIds)
      ? discoveryReport.confirmedMissingIds.map(normalizeId).filter(Boolean)
      : []
  );

  const existing = loadExistingProducts();
  const existingData =
    existing.format === "storeData"
      ? Object.values(existing.data)
      : existing.data;

  const { final, stats } = mergeDatabase(
    existingData,
    rawProducts,
    confirmedMissingIds
  );

  validateFinal(existingData, final);

  const backupCreated = createBackup();
  const content = buildProductsJs(
    existing.format,
    existing.format === "storeData" ? existing.data : existingData,
    final
  );

  if (config.safety?.atomicWrite !== false) {
    atomicWrite(content);
  } else {
    fs.writeFileSync(productsFile, content, "utf8");
  }

  validateWrittenFile(final.length, existing.format);

  const report = {
    generatedAt: new Date().toISOString(),
    existingBefore: existingData.length,
    discovered: discoveredIds.size,
    scraped: rawProducts.length,
    confirmedMissing: confirmedMissingIds.size,
    final: final.length,
    format: existing.format,
    backupCreated,
    productsFile,
    stats,
    safety: {
      discoveryComplete: discoveryReport.complete === true,
      availabilitySafe: discoveryReport.availabilitySafe === true,
      scraperSafeToPublish: scraperReport.safeToPublish !== false,
      fullCatalogSelected: scraperReport.fullCatalogSelected !== false,
    },
  };

  writeJson(generatorReportFile, report);

  console.log(`📚 Existing : ${existingData.length}`);
  console.log(`🔎 Found    : ${discoveredIds.size}`);
  console.log(`🕷️ Scraped  : ${rawProducts.length}`);
  console.log(`➕ New      : ${stats.newProducts}`);
  console.log(`🔄 Updated  : ${stats.updated}`);
  console.log(`♻️ Restored : ${stats.restored}`);
  console.log(`🚫 Unavail. : ${stats.unavailable}`);
  console.log(`⏸️ Unchanged: ${stats.unchanged}`);
  console.log(`🧑 Manual   : ${stats.manual}`);
  console.log(`📦 Final    : ${final.length}`);
  console.log(`\n✅ Generation completed safely.`);
}

try {
  main();
} catch (error) {
  console.error("\n❌ GENERATOR ERROR");
  console.error(error?.stack || error?.message || error);
  process.exit(1);
}
