import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  config,
  validateConfig,
  printConfigSummary,
} from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const debugDir = path.resolve(
  __dirname,
  config.paths?.debugDir || "./debug"
);
const stateDir = path.resolve(
  __dirname,
  config.paths?.stateDir || "./state"
);

fs.mkdirSync(debugDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

const linksFile = path.join(debugDir, "product-links.json");
const progressFile = path.join(debugDir, "product-links-progress.json");
const reportFile = path.join(debugDir, "discovery-report.json");
const dashboardFile = path.join(debugDir, "dashboard.html");
const historyFile = path.join(stateDir, "discovery-history.json");

const MAX_PAGES = Math.max(
  1,
  Number(config.automation?.maxDiscoveryPages || 250)
);
const NAVIGATION_TIMEOUT = Math.max(
  10000,
  Number(config.automation?.navigationTimeoutMs || 30000)
);
const PAGE_TIMEOUT = Math.max(
  10000,
  Number(config.automation?.pageTimeoutMs || 30000)
);
const PAGE_DELAY = Math.max(
  0,
  Number(config.automation?.renderWaitMs || 1200)
);
const LOGIN_WAIT = Math.max(
  1000,
  Number(config.automation?.loginWait || process.env.LOGIN_WAIT_MS || 5000)
);
const MISSING_CONFIRMATION_RUNS = Math.max(
  1,
  Number(config.automation?.missingConfirmationRuns || 2)
);
const MINIMUM_COVERAGE_PERCENT = Math.min(
  100,
  Math.max(
    1,
    Number(config.automation?.minimumCoveragePercent || 70)
  )
);

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temp, file);
}

function removeStaleOutputs() {
  for (const file of [linksFile, progressFile, reportFile]) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
  }
}

function extractProductId(value) {
  const raw = String(value || "");
  const patterns = [
    /\/store\/(\d+)(?:[/?#]|$)/i,
    /\/product\/(\d+)(?:[/?#]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return String(match[1]);
  }
  return "";
}

function normalizeProductUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const id = extractProductId(url.href);
    if (!id) return "";
    const baseUrl = String(
      config.sawa9ly?.baseUrl || "https://affiliate.sawa9ly.pro"
    ).replace(/\/+$/, "");
    return `${baseUrl}/store/${id}`;
  } catch {
    return "";
  }
}

function makePageUrl(pageNumber) {
  const url = new URL(config.sawa9ly.dashboardUrl);
  url.searchParams.set("page", String(pageNumber));
  return url.toString();
}

function extractPageNumberFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    for (const key of ["page", "p", "pageNumber", "page_number"]) {
      const raw = url.searchParams.get(key);
      const number = Number(raw);
      if (Number.isInteger(number) && number > 0) return number;
    }
  } catch {}
  return null;
}

function parsePageNumbersFromText(value) {
  const text = cleanText(value);
  const result = [];
  const patterns = [
    /(?:page|صفحة)\s*(?:\d+\s*(?:\/|of|sur|de|من)\s*)?(\d{1,4})/gi,
    /(?:\/|of|sur|de|من)\s*(\d{1,4})\b/gi,
    /\b(\d{1,4})\s*\/\s*(\d{1,4})\b/g,
    /\b(\d{1,4})\s+(?:pages|pages?|صفحات)\b/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const candidates = match.slice(1).filter(Boolean);
      for (const candidate of candidates) {
        const number = Number(candidate);
        if (Number.isInteger(number) && number > 0 && number <= MAX_PAGES) {
          result.push(number);
        }
      }
    }
  }

  return result;
}

async function detectPagination(page) {
  const data = await page.locator("body").evaluate((body) => {
    const selectors = [
      "a",
      "button",
      "[role='button']",
      "[role='navigation'] *",
      "nav *",
      ".pagination *",
      "[class*='pagination' i] *",
      "[class*='pager' i] *",
      "[class*='page' i] *",
      "[data-page]",
      "[data-total-pages]",
      "[aria-label]",
      "[title]",
    ];

    const nodes = [];
    const seen = new Set();

    for (const selector of selectors) {
      for (const node of body.querySelectorAll(selector)) {
        if (seen.has(node)) continue;
        seen.add(node);
        nodes.push({
          text: String(node.innerText || "").trim(),
          href: String(node.getAttribute("href") || ""),
          aria: String(node.getAttribute("aria-label") || ""),
          title: String(node.getAttribute("title") || ""),
          dataPage: String(node.getAttribute("data-page") || ""),
          dataTotalPages: String(
            node.getAttribute("data-total-pages") || ""
          ),
          className: String(node.className || ""),
        });
      }
    }

    return {
      nodes,
      bodyText: String(body.innerText || ""),
    };
  });

  const detected = new Set();

  const add = (value) => {
    const number = Number(value);
    if (Number.isInteger(number) && number > 0 && number <= MAX_PAGES) {
      detected.add(number);
    }
  };

  for (const node of data.nodes) {
    add(extractPageNumberFromUrl(node.href));
    add(node.dataPage);
    add(node.dataTotalPages);
    for (const number of parsePageNumbersFromText(node.text)) add(number);
    for (const number of parsePageNumbersFromText(node.aria)) add(number);
    for (const number of parsePageNumbersFromText(node.title)) add(number);
    for (const number of parsePageNumbersFromText(node.className)) add(number);

    // Some Sawa9ly versions render pagination as numeric buttons
    // without href/data-page attributes (for example: 1, 2, ..., 87).
    // Only accept isolated numeric labels inside pagination/navigation-like
    // elements so product prices and IDs cannot be mistaken for page numbers.
    if (
      /pagination|pager|page[-_ ]?nav|page[-_ ]?number/i.test(
        `${node.className} ${node.aria} ${node.title}`
      ) &&
      /^\d{1,4}$/.test(cleanText(node.text))
    ) {
      add(node.text);
    }
  }

  for (const number of parsePageNumbersFromText(data.bodyText)) add(number);

  const pages = [...detected].sort((a, b) => a - b);

  return {
    pages,
    maxPage: pages.length ? Math.max(...pages) : null,
    source: pages.length ? "dom" : "unknown",
  };
}

async function extractProductsFromPage(page) {
  const anchors = await page.locator("a[href]").evaluateAll((elements) =>
    elements.map((anchor) => ({
      text: String(anchor.innerText || "")
        .replace(/\s+/g, " ")
        .trim(),
      title: String(anchor.getAttribute("title") || "")
        .replace(/\s+/g, " ")
        .trim(),
      href: anchor.href || "",
    }))
  );

  const products = new Map();

  for (const anchor of anchors) {
    const id = extractProductId(anchor.href);
    if (!id) continue;

    const href = normalizeProductUrl(anchor.href);
    if (!href) continue;

    if (!products.has(id)) {
      products.set(id, {
        id,
        href,
        text: cleanText(anchor.text),
        title: cleanText(anchor.title),
      });
    }
  }

  return [...products.values()];
}

async function login(page) {
  await page.goto(config.sawa9ly.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT,
  });

  await page.waitForTimeout(2000);

  const email = page.locator('input[type="email"]').first();
  const password = page.locator('input[type="password"]').first();

  if ((await email.count()) === 0 || (await password.count()) === 0) {
    if (!/\/login(?:[/?#]|$)/i.test(page.url())) return;
    throw new Error("لم يتم العثور على حقول تسجيل الدخول في Sawa9ly Affiliate.");
  }

  if (!config.sawa9ly.email || !config.sawa9ly.password) {
    throw new Error("SAWA9LY credentials are missing.");
  }

  await email.fill(config.sawa9ly.email);
  await password.fill(config.sawa9ly.password);

  const submit = page.locator('button[type="submit"]').first();
  if (await submit.count()) await submit.click();
  else await password.press("Enter");

  await page.waitForTimeout(LOGIN_WAIT);

  if (/\/login(?:[/?#]|$)/i.test(page.url())) {
    throw new Error("فشل تسجيل الدخول إلى Sawa9ly Affiliate.");
  }
}

async function openCatalog(page) {
  await page.goto(makePageUrl(1), {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT,
  });

  await page.waitForTimeout(PAGE_DELAY);

  if (/\/login(?:[/?#]|$)/i.test(page.url())) {
    throw new Error("Sawa9ly أعاد توجيه الجلسة إلى /login.");
  }

  try {
    fs.writeFileSync(dashboardFile, await page.content(), "utf8");
  } catch {}
}

async function getVisibleProductIds(page) {
  const products = await extractProductsFromPage(page);
  return products.map((product) => String(product.id)).sort();
}

function productSignature(ids) {
  return ids.join("|");
}

async function waitForProductPageChange(page, previousSignature) {
  const deadline = Date.now() + Math.max(15000, NAVIGATION_TIMEOUT);

  while (Date.now() < deadline) {
    await page.waitForTimeout(300);
    const ids = await getVisibleProductIds(page);
    const signature = productSignature(ids);

    if (ids.length > 0 && signature !== previousSignature) {
      return ids;
    }
  }

  throw new Error(
    "Sawa9ly pagination control was clicked, but the product list did not change."
  );
}

async function findPaginationControl(page, type, targetPage = null) {
  const candidates = await page.locator(
    "button, a, [role='button'], [role='link']"
  ).evaluateAll((elements) =>
    elements.map((element, index) => ({
      index,
      text: String(element.innerText || "")
        .replace(/\s+/g, " ")
        .trim(),
      aria: String(element.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim(),
      title: String(element.getAttribute("title") || "")
        .replace(/\s+/g, " ")
        .trim(),
      href: String(element.getAttribute("href") || ""),
      disabled:
        element.hasAttribute("disabled") ||
        element.getAttribute("aria-disabled") === "true",
      className: String(element.className || ""),
    }))
  );

  const visiblePagination = candidates.filter((item) => {
    const haystack = `${item.text} ${item.aria} ${item.title} ${item.className}`;
    return /pagination|pager|page[-_ ]?nav|page[-_ ]?number/i.test(haystack);
  });

  if (type === "number") {
    const wanted = String(targetPage);
    return visiblePagination.find(
      (item) =>
        !item.disabled &&
        (item.text === wanted ||
          item.aria === wanted ||
          item.title === wanted)
    ) || candidates.find(
      (item) =>
        !item.disabled &&
        (item.text === wanted ||
          item.aria === wanted ||
          item.title === wanted)
    );
  }

  const nextPattern =
    /^(?:>|›|»|→|next|suivant|التالي|التاليّة|الصفحة التالية|page suivante)$/i;

  const next = visiblePagination.find(
    (item) =>
      !item.disabled &&
      nextPattern.test(item.text) ||
      (!item.disabled && nextPattern.test(item.aria)) ||
      (!item.disabled && nextPattern.test(item.title))
  );

  if (next) return next;

  return candidates.find((item) => {
    if (item.disabled) return false;
    const haystack = `${item.text} ${item.aria} ${item.title} ${item.className}`;
    return /(?:next|suivant|التالي|page suivante|chevron-right|arrow-right)/i.test(
      haystack
    );
  });
}

async function clickPaginationControl(page, control) {
  if (!control) return false;

  const locator = page.locator(
    "button, a, [role='button'], [role='link']"
  ).nth(control.index);

  await locator.scrollIntoViewIfNeeded();
  await locator.click({ timeout: PAGE_TIMEOUT });
  return true;
}

async function navigateCatalogPage(page, targetPage, currentPage, currentSignature) {
  if (targetPage === 1) {
    return;
  }

  // Prefer a directly visible page-number button/link.
  const direct = await findPaginationControl(page, "number", targetPage);
  if (direct) {
    await clickPaginationControl(page, direct);
    await waitForProductPageChange(page, currentSignature);
    return;
  }

  // When the pagination shows "1 2 ... 87", later page numbers are hidden.
  // Move through the real Next button one page at a time. This is deliberately
  // UI-driven instead of guessing a query parameter such as ?page=2.
  let pageCursor = currentPage;
  let signature = currentSignature;

  while (pageCursor < targetPage) {
    const next = await findPaginationControl(page, "next");

    if (!next) {
      throw new Error(
        `Could not find Sawa9ly Next pagination control while moving from page ${pageCursor} to page ${targetPage}.`
      );
    }

    await clickPaginationControl(page, next);
    await waitForProductPageChange(page, signature);

    pageCursor += 1;
    signature = productSignature(await getVisibleProductIds(page));
  }
}

async function scanPage(page, pageNumber, maxPageForLog, currentSignature = "") {
  console.log(`--- PAGE ${pageNumber}/${maxPageForLog} ---`);

  if (pageNumber === 1) {
    await page.goto(makePageUrl(1), {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT,
    });
    await page.waitForTimeout(PAGE_DELAY);
  } else {
    await navigateCatalogPage(page, pageNumber, pageNumber - 1, currentSignature);
  }

  if (/\/login(?:[/?#]|$)/i.test(page.url())) {
    throw new Error(`انتهت جلسة Sawa9ly في الصفحة ${pageNumber}.`);
  }

  const products = await extractProductsFromPage(page);
  return { products, url: page.url() };
}

async function determinePageCount(page) {
  const detected = await detectPagination(page);

  if (detected.maxPage && detected.maxPage > 1) {
    console.log(`Pagination detected from DOM: ${detected.maxPage} pages.`);
    return {
      maxPage: detected.maxPage,
      detectedPages: detected.pages,
      mode: "ui-pagination",
    };
  }

  throw new Error(
    "Could not safely determine the Sawa9ly catalogue page count from the visible pagination."
  );
}

function buildAvailabilityState(currentProducts) {
  const previousHistory = readJson(historyFile, null);
  const previousIds = new Set(
    Array.isArray(previousHistory?.discoveredIds)
      ? previousHistory.discoveredIds.map(String).filter(Boolean)
      : []
  );
  const previousStreaks =
    previousHistory?.missingStreaks &&
    typeof previousHistory.missingStreaks === "object"
      ? previousHistory.missingStreaks
      : {};

  const currentIds = new Set(
    currentProducts.map((product) => String(product.id)).filter(Boolean)
  );

  const missingStreaks = {};
  const confirmedMissingIds = [];

  for (const id of currentIds) missingStreaks[id] = 0;

  for (const id of previousIds) {
    if (currentIds.has(id)) continue;

    const streak = Number(previousStreaks[id] || 0) + 1;
    missingStreaks[id] = streak;

    if (streak >= MISSING_CONFIRMATION_RUNS) {
      confirmedMissingIds.push(id);
    }
  }

  return {
    previousIds: [...previousIds],
    currentIds: [...currentIds],
    missingStreaks,
    confirmedMissingIds,
  };
}

function evaluateDiscoverySafety({
  maxPage,
  pageCounts,
  products,
  previousCount,
}) {
  const pagesScanned = Object.keys(pageCounts).length;
  const everyPageHasProducts = Object.values(pageCounts).every(
    (count) => Number(count) > 0
  );
  const correctPageCount = pagesScanned === maxPage;
  const hasProducts = products.length > 0;
  const withinSafetyLimit = maxPage <= MAX_PAGES;

  const coveragePercent = previousCount
    ? (products.length / previousCount) * 100
    : 100;

  const countCoverageSafe =
    previousCount === 0 || coveragePercent >= MINIMUM_COVERAGE_PERCENT;

  const availabilitySafe =
    correctPageCount &&
    everyPageHasProducts &&
    hasProducts &&
    withinSafetyLimit &&
    countCoverageSafe;

  return {
    availabilitySafe,
    coveragePercent,
    checks: {
      correctPageCount,
      everyPageHasProducts,
      hasProducts,
      withinSafetyLimit,
      countCoverageSafe,
    },
  };
}

async function main() {
  validateConfig();
  printConfigSummary();
  removeStaleOutputs();

  if (!config.sawa9ly.email || !config.sawa9ly.password) {
    throw new Error("SAWA9LY credentials are missing.");
  }

  console.log("\n==============================================");
  console.log("       PRIX-CHOC / SAWA9LY DISCOVERY");
  console.log("==============================================\n");

  const browser = await chromium.launch({
    headless: config.automation.headless,
  });

  let context = null;
  let page = null;

  try {
    context = await browser.newContext({
      viewport: config.browser.viewport,
      userAgent: config.browser.userAgent,
      locale: "ar-DZ",
      timezoneId: "Africa/Algiers",
    });

    page = await context.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
    page.setDefaultTimeout(PAGE_TIMEOUT);

    console.log("1) Logging in...");
    await login(page);
    console.log("✅ Login successful.");

    console.log("2) Opening catalog...");
    await openCatalog(page);
    console.log(`Catalog opened: ${page.url()}`);

    console.log("3) Detecting catalog pagination...");
    const pagination = await determinePageCount(page);

    if (pagination.maxPage > MAX_PAGES) {
      throw new Error(
        `Detected ${pagination.maxPage} pages, exceeding safety limit ${MAX_PAGES}.`
      );
    }

    console.log(`Pages to scan: ${pagination.maxPage}`);

    const previousHistory = readJson(historyFile, null);
    const previousCount = Array.isArray(previousHistory?.discoveredIds)
      ? previousHistory.discoveredIds.length
      : 0;

    const allProducts = new Map();
    const pageCounts = {};
    const pageUrls = {};

    console.log("4) Collecting all product links...");

    let currentSignature = "";

    for (let pageNumber = 1; pageNumber <= pagination.maxPage; pageNumber++) {
      const result = await scanPage(
        page,
        pageNumber,
        pagination.maxPage,
        currentSignature
      );

      const products = result.products;
      currentSignature = productSignature(
        products.map((product) => String(product.id)).sort()
      );
      pageCounts[String(pageNumber)] = products.length;
      pageUrls[String(pageNumber)] = result.url;

      if (products.length === 0) {
        throw new Error(
          `Page ${pageNumber} returned ZERO product links. Discovery stopped safely.`
        );
      }

      for (const product of products) {
        allProducts.set(product.id, product);
      }

      writeJson(progressFile, {
        updatedAt: new Date().toISOString(),
        pagesCompleted: pageNumber,
        pagesTotal: pagination.maxPage,
        productsFound: allProducts.size,
        products: [...allProducts.values()],
      });

      console.log(
        `Products on page: ${products.length} | Total unique: ${allProducts.size}`
      );
    }

    const finalProducts = [...allProducts.values()];

    if (finalProducts.length === 0) {
      throw new Error("Discovery returned ZERO products. Refusing to continue.");
    }

    const uniqueDiscoveredIds = finalProducts
      .map((product) => String(product.id))
      .filter(Boolean);

    if (new Set(uniqueDiscoveredIds).size !== uniqueDiscoveredIds.length) {
      throw new Error("Discovery produced duplicate product IDs.");
    }

    const safety = evaluateDiscoverySafety({
      maxPage: pagination.maxPage,
      pageCounts,
      products: finalProducts,
      previousCount,
    });

    const availability = safety.availabilitySafe
      ? buildAvailabilityState(finalProducts)
      : {
          previousIds: Array.isArray(previousHistory?.discoveredIds)
            ? previousHistory.discoveredIds.map(String)
            : [],
          currentIds: uniqueDiscoveredIds,
          missingStreaks:
            previousHistory?.missingStreaks &&
            typeof previousHistory.missingStreaks === "object"
              ? previousHistory.missingStreaks
              : {},
          confirmedMissingIds: [],
        };

    const report = {
      complete: true,
      availabilitySafe: safety.availabilitySafe,
      safetyChecks: safety.checks,
      pagesScanned: pagination.maxPage,
      detectedPages: pagination.detectedPages,
      paginationMode: pagination.mode,
      productsFound: finalProducts.length,
      uniqueProductsFound: uniqueDiscoveredIds.length,
      discovered: uniqueDiscoveredIds.length,
      previousProductsFound: previousCount,
      countDelta: uniqueDiscoveredIds.length - previousCount,
      coveragePercent: safety.coveragePercent,
      pageCounts,
      pageUrls,
      discoveredIds: uniqueDiscoveredIds,
      missingStreaks: availability.missingStreaks,
      confirmedMissingIds: availability.confirmedMissingIds,
      missingConfirmationRuns: MISSING_CONFIRMATION_RUNS,
      generatedAt: new Date().toISOString(),
    };

    writeJson(linksFile, finalProducts);
    writeJson(reportFile, report);

    // Never advance missing-product history on an unsafe discovery.
    if (safety.availabilitySafe) {
      writeJson(historyFile, report);
    } else {
      console.warn(
        `⚠️ Discovery safety rejected this run: ${safety.coveragePercent.toFixed(2)}% of previous catalogue.`
      );
      console.warn(
        "⚠️ Existing availability history was NOT changed."
      );
    }

    console.log("\n==============================================");
    console.log("           DISCOVERY COMPLETED");
    console.log("==============================================");
    console.log(`Pages scanned       : ${pagination.maxPage}`);
    console.log(`Products discovered : ${finalProducts.length}`);
    console.log(`Previous count      : ${previousCount}`);
    console.log(`Coverage            : ${safety.coveragePercent.toFixed(2)}%`);
    console.log(
      `Availability safe   : ${safety.availabilitySafe ? "YES" : "NO"}`
    );
    console.log(
      `Confirmed missing   : ${availability.confirmedMissingIds.length}`
    );

    if (!safety.availabilitySafe) {
      throw new Error(
        "Discovery completed, but safety checks rejected publication. Existing catalogue was not changed."
      );
    }
  } finally {
    try {
      if (context) await context.close();
    } catch {}
    try {
      await browser.close();
    } catch {}
  }
}

main().catch((error) => {
  console.error("\n❌ DISCOVERY FAILED");
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
