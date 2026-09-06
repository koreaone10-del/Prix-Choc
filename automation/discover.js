import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  config,
  validateConfig,
  printConfigSummary,
} from "./config.js";

/*
=========================================================
 PRIX-CHOC
 SAWA9LY PRODUCT DISCOVERY
=========================================================

المسؤوليات:

1. تسجيل الدخول إلى Sawa9ly Affiliate.
2. فتح كتالوج المنتجات.
3. اكتشاف جميع صفحات الكتالوج.
4. اكتشاف جميع روابط المنتجات.
5. دعم:
      /store/123
      /product/123
6. توحيد جميع الروابط إلى:
      /store/123
7. منع اعتبار الكتالوج فارغاً بسبب خطأ مؤقت.
8. إنشاء product-links.json.
9. إنشاء discovery-report.json.
10. حفظ تاريخ الاكتشاف.
11. حساب المنتجات المختفية.
12. تأكيد الاختفاء بعد عدد محدد من العمليات الناجحة.
13. عدم لمس products.js.

مهم جداً:

Discovery لا يعدل products.js.
هو ينتج فقط البيانات التي سيستخدمها scraper/generator.
=========================================================
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
=========================================================
 DIRECTORIES
=========================================================
*/

const debugDir = path.resolve(
  __dirname,
  config.paths.debugDir || "./debug"
);

const stateDir = path.resolve(
  __dirname,
  config.paths.stateDir || "./state"
);

fs.mkdirSync(debugDir, {
  recursive: true,
});

fs.mkdirSync(stateDir, {
  recursive: true,
});

/*
=========================================================
 OUTPUT FILES
=========================================================
*/

const linksFile = path.join(
  debugDir,
  "product-links.json"
);

const progressFile = path.join(
  debugDir,
  "product-links-progress.json"
);

const reportFile = path.join(
  debugDir,
  "discovery-report.json"
);

const dashboardFile = path.join(
  debugDir,
  "dashboard.html"
);

const historyFile = path.join(
  stateDir,
  "discovery-history.json"
);

/*
=========================================================
 SETTINGS
=========================================================
*/

const MAX_PAGES = Math.max(
  1,
  Number(
    config.automation.maxDiscoveryPages || 250
  )
);

const NAVIGATION_TIMEOUT = Math.max(
  10000,
  Number(
    config.automation.navigationTimeoutMs || 30000
  )
);

const PAGE_TIMEOUT = Math.max(
  10000,
  Number(
    config.automation.pageTimeoutMs || 30000
  )
);

const PAGE_DELAY = Math.max(
  0,
  Number(
    config.automation.renderWaitMs || 1200
  )
);

const LOGIN_WAIT = Math.max(
  1000,
  Number(
    process.env.LOGIN_WAIT_MS || 5000
  )
);

const MISSING_CONFIRMATION_RUNS =
  Math.max(
    1,
    Number(
      config.automation
        .missingConfirmationRuns || 2
    )
  );

/*
=========================================================
 TEXT HELPERS
=========================================================
*/

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

/*
=========================================================
 JSON HELPERS
=========================================================
*/

function readJson(
  file,
  fallback = null
) {
  try {
    if (!fs.existsSync(file)) {
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
  } catch (error) {
    console.warn(
      `⚠️ Could not read JSON: ${file}`
    );

    return fallback;
  }
}

function writeJson(
  file,
  value
) {
  const directory =
    path.dirname(file);

  fs.mkdirSync(
    directory,
    {
      recursive: true,
    }
  );

  const temporaryFile =
    `${file}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(
      value,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    temporaryFile,
    file
  );
}

/*
=========================================================
 CLEAN OLD DISCOVERY OUTPUTS
=========================================================
*/

function removeStaleDiscoveryOutputs() {
  const files = [
    linksFile,
    progressFile,
    reportFile,
  ];

  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    } catch (error) {
      console.warn(
        `⚠️ Could not remove old file: ${file}`
      );
    }
  }
}

/*
=========================================================
 URL HELPERS
=========================================================
*/

function extractProductId(value) {
  const raw = String(
    value || ""
  );

  const patterns = [
    /\/store\/(\d+)(?:[/?#]|$)/i,
    /\/product\/(\d+)(?:[/?#]|$)/i,
  ];

  for (const pattern of patterns) {
    const match =
      raw.match(pattern);

    if (match) {
      return String(
        match[1]
      );
    }
  }

  return "";
}

function normalizeProductUrl(value) {
  try {
    const url =
      new URL(
        String(value || "")
      );

    const id =
      extractProductId(
        url.href
      );

    if (!id) {
      return "";
    }

    const baseUrl =
      String(
        config.sawa9ly.baseUrl ||
          "https://affiliate.sawa9ly.pro"
      ).replace(
        /\/+$/,
        ""
      );

    return `${baseUrl}/store/${id}`;
  } catch {
    return "";
  }
}

function isProductUrl(value) {
  return Boolean(
    extractProductId(value)
  );
}

function makePageUrl(
  baseUrl,
  pageNumber
) {
  const url =
    new URL(baseUrl);

  url.searchParams.set(
    "page",
    String(pageNumber)
  );

  return url.toString();
}

function extractPageNumber(value) {
  try {
    const url =
      new URL(
        String(value || "")
      );

    const page =
      Number(
        url.searchParams.get(
          "page"
        )
      );

    if (
      Number.isInteger(page) &&
      page > 0
    ) {
      return page;
    }

    return null;
  } catch {
    return null;
  }
}

/*
=========================================================
 PAGE CONTENT HELPERS
=========================================================
*/

async function getPageProductCount(
  page
) {
  const products =
    await extractProductsFromPage(
      page
    );

  return products.length;
}

/*
=========================================================
 PAGINATION DETECTION

 مهم:
 لا نستعمل cleanText() داخل evaluateAll().
 لأن evaluateAll يعمل داخل Chromium وليس
 داخل Node.js.
=========================================================
*/

async function detectPagination(page) {
  const links =
    await page
      .locator("a")
      .evaluateAll(
        (anchors) =>
          anchors
            .map((anchor) => ({
              text: String(
                anchor.innerText || ""
              )
                .replace(
                  /\s+/g,
                  " "
                )
                .trim(),

              href:
                anchor.href || "",
            }))
            .filter(
              (item) =>
                Boolean(
                  item.href
                )
            )
      );

  const pageNumbers = [];

  for (const item of links) {
    const number =
      extractPageNumber(
        item.href
      );

    if (
      Number.isInteger(number) &&
      number > 0
    ) {
      pageNumbers.push(
        number
      );
    }
  }

  const uniquePages =
    [
      ...new Set(
        pageNumbers
      ),
    ].sort(
      (a, b) => a - b
    );

  return uniquePages;
}

/*
=========================================================
 PRODUCT LINK EXTRACTION

 نفس الإصلاح:
 لا نستعمل cleanText() داخل evaluateAll().
=========================================================
*/

async function extractProductsFromPage(
  page
) {
  const anchors =
    await page
      .locator("a")
      .evaluateAll(
        (elements) =>
          elements.map(
            (anchor) => ({
              text: String(
                anchor.innerText ||
                  ""
              )
                .replace(
                  /\s+/g,
                  " "
                )
                .trim(),

              href:
                anchor.href || "",

              title: String(
                anchor.getAttribute(
                  "title"
                ) || ""
              )
                .replace(
                  /\s+/g,
                  " "
                )
                .trim(),
            })
          )
      );

  const productsById =
    new Map();

  for (const anchor of anchors) {
    const id =
      extractProductId(
        anchor.href
      );

    if (!id) {
      continue;
    }

    const normalized =
      normalizeProductUrl(
        anchor.href
      );

    if (!normalized) {
      continue;
    }

    if (
      !productsById.has(id)
    ) {
      productsById.set(
        id,
        {
          id,
          href: normalized,
          text:
            cleanText(
              anchor.text
            ),
          title:
            cleanText(
              anchor.title
            ),
        }
      );
    }
  }

  return [
    ...productsById.values(),
  ];
}

/*
=========================================================
 LOGIN
=========================================================
*/

async function login(page) {
  console.log("");
  console.log(
    "1) Opening Sawa9ly Affiliate login..."
  );

  await page.goto(
    config.sawa9ly.loginUrl,
    {
      waitUntil:
        "domcontentloaded",
      timeout:
        NAVIGATION_TIMEOUT,
    }
  );

  await page.waitForTimeout(
    2000
  );

  const emailSelector =
    'input[type="email"]';

  const passwordSelector =
    'input[type="password"]';

  const emailCount =
    await page
      .locator(emailSelector)
      .count();

  const passwordCount =
    await page
      .locator(passwordSelector)
      .count();

  /*
  Already authenticated.
  */

  if (
    emailCount === 0 &&
    passwordCount === 0
  ) {
    await page.waitForTimeout(
      LOGIN_WAIT
    );

    const stillPassword =
      await page
        .locator(
          passwordSelector
        )
        .count();

    if (
      stillPassword === 0
    ) {
      console.log(
        "ℹ️ Login form not displayed; continuing with current session."
      );

      return;
    }
  }

  /*
  Credentials must exist.
  */

  if (
    !config.sawa9ly.email ||
    !config.sawa9ly.password
  ) {
    throw new Error(
      "SAWA9LY credentials are missing."
    );
  }

  const emailInput =
    page
      .locator(
        emailSelector
      )
      .first();

  const passwordInput =
    page
      .locator(
        passwordSelector
      )
      .first();

  if (
    await emailInput.count() ===
      0 ||
    await passwordInput.count() ===
      0
  ) {
    throw new Error(
      "لم يتم العثور على حقول تسجيل الدخول في Sawa9ly Affiliate."
    );
  }

  console.log(
    "Login form detected."
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
    await submitButton.count() >
    0
  ) {
    await submitButton.click();
  } else {
    await passwordInput.press(
      "Enter"
    );
  }

  await page.waitForTimeout(
    LOGIN_WAIT
  );

  const currentUrl =
    page.url();

  if (
    /\/login(?:[/?#]|$)/i.test(
      currentUrl
    )
  ) {
    throw new Error(
      "فشل تسجيل الدخول إلى Sawa9ly Affiliate. بقيت الصفحة على /login."
    );
  }

  console.log(
    "✅ Login successful."
  );
}

/*
=========================================================
 OPEN CATALOG
=========================================================
*/

async function openCatalog(page) {
  console.log("");
  console.log(
    "2) Opening Sawa9ly product catalog..."
  );

  const firstPageUrl =
    makePageUrl(
      config.sawa9ly.dashboardUrl,
      1
    );

  await page.goto(
    firstPageUrl,
    {
      waitUntil:
        "domcontentloaded",
      timeout:
        NAVIGATION_TIMEOUT,
    }
  );

  await page.waitForTimeout(
    PAGE_DELAY
  );

  const currentUrl =
    page.url();

  if (
    /\/login(?:[/?#]|$)/i.test(
      currentUrl
    )
  ) {
    throw new Error(
      "Sawa9ly أعاد توجيه الجلسة إلى /login."
    );
  }

  try {
    fs.writeFileSync(
      dashboardFile,
      await page.content(),
      "utf8"
    );
  } catch {
    console.warn(
      "⚠️ Could not save dashboard.html"
    );
  }

  console.log(
    `Catalog opened: ${currentUrl}`
  );
}

/*
=========================================================
 DISCOVER PAGE COUNT
=========================================================
*/

async function discoverPageCount(
  page
) {
  console.log("");
  console.log(
    "3) Detecting catalog pagination..."
  );

  const detectedPages =
    await detectPagination(
      page
    );

  /*
  Always include page 1.
  */

  if (
    !detectedPages.includes(
      1
    )
  ) {
    detectedPages.unshift(1);
  }

  let maxPage =
    Math.max(
      1,
      ...detectedPages
    );

  if (
    maxPage >
    MAX_PAGES
  ) {
    throw new Error(
      `تم اكتشاف ${maxPage} صفحة، وهذا يتجاوز حد الأمان ${MAX_PAGES}.`
    );
  }

  console.log(
    `Detected pages: ${detectedPages.join(
      ", "
    )}`
  );

  console.log(
    `Pages to scan: ${maxPage}`
  );

  return {
    detectedPages,
    maxPage,
  };
}

/*
=========================================================
 DISCOVER ALL PRODUCTS
=========================================================
*/

async function discoverProducts(
  page,
  maxPage
) {
  console.log("");
  console.log(
    "4) Collecting product links..."
  );

  const allProducts =
    new Map();

  const pageCounts = {};
  const pageUrls = {};

  for (
    let pageNumber = 1;
    pageNumber <= maxPage;
    pageNumber++
  ) {
    const pageUrl =
      makePageUrl(
        config.sawa9ly.dashboardUrl,
        pageNumber
      );

    console.log("");
    console.log(
      `--- PAGE ${pageNumber}/${maxPage} ---`
    );

    await page.goto(
      pageUrl,
      {
        waitUntil:
          "domcontentloaded",
        timeout:
          NAVIGATION_TIMEOUT,
      }
    );

    await page.waitForTimeout(
      PAGE_DELAY
    );

    const currentUrl =
      page.url();

    if (
      /\/login(?:[/?#]|$)/i.test(
        currentUrl
      )
    ) {
      throw new Error(
        `انتهت جلسة Sawa9ly في الصفحة ${pageNumber}.`
      );
    }

    pageUrls[
      String(pageNumber)
    ] = currentUrl;

    const products =
      await extractProductsFromPage(
        page
      );

    pageCounts[
      String(pageNumber)
    ] = products.length;

    /*
    SAFETY RULE:

    أي صفحة صفر منتجات توقف العملية بالكامل.

    السبب:
    لا نريد أن يتحول خلل مؤقت في Sawa9ly
    إلى آلاف المنتجات "مفقودة".
    */

    if (
      products.length === 0
    ) {
      throw new Error(
        `Page ${pageNumber} returned ZERO product links. Discovery stopped safely.`
      );
    }

    for (const product of products) {
      allProducts.set(
        product.id,
        product
      );
    }

    writeJson(
      progressFile,
      {
        updatedAt:
          new Date().toISOString(),

        pagesCompleted:
          pageNumber,

        pagesTotal:
          maxPage,

        productsFound:
          allProducts.size,

        products:
          [
            ...allProducts.values(),
          ],
      }
    );

    console.log(
      `Products on page: ${products.length}`
    );

    console.log(
      `Total unique products: ${allProducts.size}`
    );
  }

  const finalProducts =
    [
      ...allProducts.values(),
    ];

  if (
    finalProducts.length === 0
  ) {
    throw new Error(
      "Discovery returned ZERO products. Refusing to continue."
    );
  }

  return {
    products:
      finalProducts,

    pageCounts,

    pageUrls,
  };
}

/*
=========================================================
 AVAILABILITY HISTORY

 القاعدة:

 تشغيل ناجح:
   المنتج موجود => streak = 0

 المنتج غير موجود:
   streak + 1

 بعد تشغيلين متتاليين:
   confirmedMissingIds

 إذا عاد المنتج:
   streak = 0
   ولن يكون ضمن confirmedMissingIds
=========================================================
*/

function buildAvailabilityState(
  currentProducts
) {
  const previousHistory =
    readJson(
      historyFile,
      null
    );

  const previousIds =
    new Set(
      Array.isArray(
        previousHistory?.discoveredIds
      )
        ? previousHistory.discoveredIds
            .map(String)
            .filter(Boolean)
        : []
    );

  const previousStreaks =
    previousHistory?.missingStreaks &&
    typeof previousHistory.missingStreaks ===
      "object"
      ? previousHistory.missingStreaks
      : {};

  const currentIds =
    new Set(
      currentProducts
        .map((product) =>
          String(
            product.id
          )
        )
        .filter(Boolean)
    );

  const missingStreaks = {};
  const confirmedMissingIds =
    [];

  /*
  Current products:
  always reset missing streak.
  */

  for (const id of currentIds) {
    missingStreaks[id] = 0;
  }

  /*
  Products absent from this successful
  discovery run.
  */

  for (const id of previousIds) {
    if (
      currentIds.has(id)
    ) {
      continue;
    }

    const previousStreak =
      Number(
        previousStreaks[id] ||
          0
      );

    const newStreak =
      previousStreak + 1;

    missingStreaks[id] =
      newStreak;

    if (
      newStreak >=
      MISSING_CONFIRMATION_RUNS
    ) {
      confirmedMissingIds.push(
        id
      );
    }
  }

  return {
    previousIds:
      [
        ...previousIds,
      ],

    currentIds:
      [
        ...currentIds,
      ],

    missingStreaks,

    confirmedMissingIds,
  };
}

/*
=========================================================
 DISCOVERY SAFETY
=========================================================
*/

function evaluateDiscoverySafety({
  maxPage,
  pageCounts,
  products,
}) {
  const pagesScanned =
    Object.keys(
      pageCounts
    ).length;

  const everyPageHasProducts =
    Object.values(
      pageCounts
    ).every(
      (count) =>
        Number(count) > 0
    );

  const correctPageCount =
    pagesScanned ===
    maxPage;

  const hasProducts =
    products.length > 0;

  const withinSafetyLimit =
    maxPage <=
    MAX_PAGES;

  const availabilitySafe =
    correctPageCount &&
    everyPageHasProducts &&
    hasProducts &&
    withinSafetyLimit;

  return {
    availabilitySafe,

    checks: {
      correctPageCount,

      everyPageHasProducts,

      hasProducts,

      withinSafetyLimit,
    },
  };
}

/*
=========================================================
 BROWSER SETUP
=========================================================
*/

async function createBrowser() {
  return chromium.launch({
    headless:
      config.automation.headless,
  });
}

async function createContext(
  browser
) {
  return browser.newContext({
    viewport:
      config.browser.viewport,

    userAgent:
      config.browser.userAgent,

    locale:
      "ar-DZ",

    timezoneId:
      "Africa/Algiers",
  });
}

/*
=========================================================
 MAIN
=========================================================
*/

async function main() {
  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    "       PRIX-CHOC / SAWA9LY DISCOVERY"
  );
  console.log(
    "=============================================="
  );
  console.log("");

  validateConfig();

  printConfigSummary();

  removeStaleDiscoveryOutputs();

  if (
    !config.sawa9ly.email
  ) {
    throw new Error(
      "SAWA9LY_EMAIL is missing."
    );
  }

  if (
    !config.sawa9ly.password
  ) {
    throw new Error(
      "SAWA9LY_PASSWORD is missing."
    );
  }

  console.log(
    "Credentials detected."
  );

  console.log(
    "Launching Chromium..."
  );

  const browser =
    await createBrowser();

  let context = null;
  let page = null;

  try {
    context =
      await createContext(
        browser
      );

    page =
      await context.newPage();

    page.setDefaultNavigationTimeout(
      NAVIGATION_TIMEOUT
    );

    page.setDefaultTimeout(
      PAGE_TIMEOUT
    );

    /*
    LOGIN
    */

    await login(page);

    /*
    CATALOG
    */

    await openCatalog(page);

    /*
    PAGINATION
    */

    const pagination =
      await discoverPageCount(
        page
      );

    /*
    PRODUCTS
    */

    const discovery =
      await discoverProducts(
        page,
        pagination.maxPage
      );

    /*
    SAFETY
    */

    const safety =
      evaluateDiscoverySafety({
        maxPage:
          pagination.maxPage,

        pageCounts:
          discovery.pageCounts,

        products:
          discovery.products,
      });

    /*
    CRITICAL:

    إذا لم يكن الاكتشاف آمناً،
    لا نحدث availability history.

    لأننا لا نريد أن يتراكم
    missing streak بسبب خلل مؤقت.
    */

    let availability;

    if (
      safety.availabilitySafe
    ) {
      availability =
        buildAvailabilityState(
          discovery.products
        );
    } else {
      const previousHistory =
        readJson(
          historyFile,
          null
        );

      availability = {
        previousIds:
          Array.isArray(
            previousHistory?.discoveredIds
          )
            ? previousHistory.discoveredIds.map(
                String
              )
            : [],

        currentIds:
          discovery.products.map(
            (product) =>
              String(
                product.id
              )
          ),

        missingStreaks:
          previousHistory?.missingStreaks &&
          typeof previousHistory.missingStreaks ===
            "object"
            ? previousHistory.missingStreaks
            : {},

        confirmedMissingIds:
          [],
      };

      console.warn("");
      console.warn(
        "⚠️ Discovery is NOT availability-safe."
      );
      console.warn(
        "⚠️ Missing-product confirmation was NOT advanced."
      );
      console.warn("");
    }

    /*
    DISCOVERED IDS
    */

    const discoveredIds =
      discovery.products
        .map((product) =>
          String(
            product.id
          )
        )
        .filter(Boolean);

    const uniqueDiscoveredIds =
      [
        ...new Set(
          discoveredIds
        ),
      ];

    if (
      uniqueDiscoveredIds.length ===
      0
    ) {
      throw new Error(
        "No valid product IDs were discovered."
      );
    }

    /*
    PREVIOUS COUNT
    */

    const previousCount =
      availability.previousIds
        .length;

    const currentCount =
      uniqueDiscoveredIds.length;

    const countDelta =
      currentCount -
      previousCount;

    /*
    FINAL REPORT

    نضيف discovered و uniqueProductsFound
    معاً حتى تكون واجهة التقرير متوافقة
    مع النسخ المختلفة من scraper/generator.
    */

    const report = {
      complete:
        true,

      availabilitySafe:
        safety.availabilitySafe,

      safetyChecks:
        safety.checks,

      pagesScanned:
        pagination.maxPage,

      detectedPages:
        pagination.detectedPages,

      productsFound:
        discovery.products.length,

      uniqueProductsFound:
        uniqueDiscoveredIds.length,

      /*
      Compatibility field.
      */

      discovered:
        uniqueDiscoveredIds.length,

      previousProductsFound:
        previousCount,

      countDelta,

      pageCounts:
        discovery.pageCounts,

      pageUrls:
        discovery.pageUrls,

      discoveredIds:
        uniqueDiscoveredIds,

      missingStreaks:
        availability.missingStreaks,

      confirmedMissingIds:
        availability.confirmedMissingIds,

      missingConfirmationRuns:
        MISSING_CONFIRMATION_RUNS,

      generatedAt:
        new Date().toISOString(),
    };

    /*
    FINAL SAFETY CHECK
    */

    if (
      !safety.availabilitySafe
    ) {
      console.warn(
        "⚠️ Discovery result saved for diagnostics only."
      );
      console.warn(
        "⚠️ Availability decisions are NOT trusted."
      );
    }

    /*
    SAVE PRODUCT LINKS
    */

    writeJson(
      linksFile,
      discovery.products
    );

    /*
    SAVE REPORT
    */

    writeJson(
      reportFile,
      report
    );

    /*
    UPDATE HISTORY ONLY WHEN SAFE

    هذا مهم جداً.

    لا نريد تشغيل Discovery فاشل
    أن يعتبر المنتجات مفقودة.
    */

    if (
      safety.availabilitySafe
    ) {
      writeJson(
        historyFile,
        report
      );
    }

    /*
    FINAL OUTPUT
    */

    console.log("");
    console.log(
      "=============================================="
    );
    console.log(
      "           DISCOVERY COMPLETED"
    );
    console.log(
      "=============================================="
    );

    console.log(
      `Pages scanned       : ${pagination.maxPage}`
    );

    console.log(
      `Products discovered : ${discovery.products.length}`
    );

    console.log(
      `Unique product IDs  : ${uniqueDiscoveredIds.length}`
    );

    console.log(
      `Previous count      : ${previousCount}`
    );

    console.log(
      `Count delta         : ${
        countDelta >= 0
          ? "+"
          : ""
      }${countDelta}`
    );

    console.log(
      `Availability safe   : ${
        safety.availabilitySafe
          ? "YES"
          : "NO"
      }`
    );

    console.log(
      `Confirmed missing   : ${availability.confirmedMissingIds.length}`
    );

    console.log(
      `Missing threshold   : ${MISSING_CONFIRMATION_RUNS}`
    );

    console.log("");

    console.log(
      `Product links : ${linksFile}`
    );

    console.log(
      `Report        : ${reportFile}`
    );

    console.log(
      `History       : ${historyFile}`
    );

    console.log("");

    console.log(
      "First discovered products:"
    );

    discovery.products
      .slice(0, 10)
      .forEach(
        (product, index) => {
          console.log(
            `${index + 1}. [${product.id}] ${product.href}`
          );
        }
      );

    console.log("");

    if (
      !safety.availabilitySafe
    ) {
      /*
      Discovery itself succeeded in collecting data,
      but availability decisions are not safe.
      The scraper is therefore allowed to inspect
      the data, but generator must not use the report
      to mark products unavailable.
      */

      console.warn(
        "⚠️ DISCOVERY FINISHED WITH SAFETY WARNING."
      );
    } else {
      console.log(
        "✅ Discovery completed safely."
      );
    }
  } finally {
    if (context) {
      try {
        await context.close();
      } catch {
        // Ignore cleanup errors.
      }
    }

    try {
      await browser.close();
    } catch {
      // Ignore cleanup errors.
    }
  }
}

/*
=========================================================
 PROCESS ENTRY
=========================================================
*/

main().catch(
  (error) => {
    console.error("");
    console.error(
      "❌ DISCOVERY FAILED"
    );
    console.error("");
    console.error(
      error?.stack ||
        error?.message ||
        error
    );
    console.error("");

    process.exitCode = 1;
  }
);
