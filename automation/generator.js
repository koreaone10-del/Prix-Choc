import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  config,
  validateConfig,
} from "./config.js";

validateConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
=========================================================
 PRIX CHOC
 SAWA9LY PRODUCT GENERATOR
=========================================================

الوظائف:

1. قراءة نتيجة scraper.
2. قراءة المنتجات الحالية.
3. تحديث المنتجات الموجودة.
4. إضافة المنتجات الجديدة.
5. تحديث السعر.
6. تحديث الصور.
7. الاحتفاظ بكل الصور.
8. عدم حذف المنتجات القديمة.
9. جعل المنتج unavailable فقط عندما
   يؤكد discovery اختفاءه.
10. إعادة المنتج available عندما يعود.
11. الحفاظ على المنتجات اليدوية.
12. الحفاظ على جميع الحقول القديمة.
13. منع إنشاء products.js فارغ أو ناقص.
14. الكتابة بطريقة atomic.
15. فحص products.js بعد الكتابة.

مهم:
generator.js لا يتصل بـ Sawa9ly.
=========================================================
*/


/*
=========================================================
 PATHS
=========================================================
*/

const outputDir = path.resolve(
  config.paths.outputDir
);

const debugDir = path.resolve(
  config.paths.debugDir
);

const productsFile = path.resolve(
  config.paths.productsFile
);

const rawProductsFile = path.join(
  outputDir,
  "products.raw.json"
);

const productLinksFile = path.join(
  debugDir,
  "product-links.json"
);

const discoveryReportFile = path.join(
  debugDir,
  "discovery-report.json"
);

const scraperReportFile = path.join(
  debugDir,
  "scraper-report.json"
);

const generatorReportFile = path.join(
  debugDir,
  "generator-report.json"
);

const backupProductsFile = path.join(
  debugDir,
  "products-before-generation.js"
);

fs.mkdirSync(
  outputDir,
  { recursive: true }
);

fs.mkdirSync(
  debugDir,
  { recursive: true }
);


/*
=========================================================
 BASIC HELPERS
=========================================================
*/

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    const content =
      fs.readFileSync(
        file,
        "utf8"
      );

    if (!content.trim()) {
      return fallback;
    }

    return JSON.parse(content);
  } catch {
    return fallback;
  }
}


function writeJson(file, data) {
  const tempFile =
    `${file}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );

  fs.renameSync(
    tempFile,
    file
  );
}


function normalizeId(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const text =
    String(value).trim();

  const match =
    text.match(/\d+/);

  return match
    ? String(match[0])
    : "";
}


function productIdFromUrl(value) {
  const match =
    String(value || "").match(
      /\/(?:store|product)\/(\d+)/i
    );

  return match
    ? String(match[1])
    : "";
}


function normalizeProductUrl(value) {
  const id =
    productIdFromUrl(value);

  if (!id) {
    return "";
  }

  const base =
    String(
      config.sawa9ly.baseUrl
    ).replace(
      /\/+$/,
      ""
    );

  return `${base}/store/${id}`;
}


/*
=========================================================
 PRICE VALIDATION
=========================================================
*/

function isValidPrice(value) {
  const number =
    Number(value);

  return (
    Number.isFinite(number) &&
    number > 0 &&
    number < 100000000
  );
}


/*
=========================================================
 IMAGE VALIDATION
=========================================================
*/

function isValidImage(value) {
  if (!value) {
    return false;
  }

  const text =
    String(value).trim();

  if (!text) {
    return false;
  }

  if (
    text.startsWith("data:") ||
    text.startsWith("blob:")
  ) {
    return false;
  }

  return (
    /^https?:\/\//i.test(text) ||
    text.startsWith("/")
  );
}


function normalizeImages(product) {
  const images = [];

  const add = (value) => {
    if (
      !isValidImage(value)
    ) {
      return;
    }

    const image =
      String(value).trim();

    if (
      !images.includes(image)
    ) {
      images.push(image);
    }
  };

  add(product?.image);

  if (
    Array.isArray(
      product?.images
    )
  ) {
    for (
      const image of
        product.images
    ) {
      add(image);
    }
  }

  return images.slice(
    0,
    20
  );
}


/*
=========================================================
 LOAD JSON FILES
=========================================================
*/

function loadRawProducts() {
  if (
    !fs.existsSync(
      rawProductsFile
    )
  ) {
    throw new Error(
      `Missing scraper output: ${rawProductsFile}`
    );
  }

  const products =
    readJson(
      rawProductsFile,
      null
    );

  if (
    !Array.isArray(products)
  ) {
    throw new Error(
      "products.raw.json must contain an array."
    );
  }

  return products;
}


function loadProductLinks() {
  if (
    !fs.existsSync(
      productLinksFile
    )
  ) {
    throw new Error(
      `Missing discovery links: ${productLinksFile}`
    );
  }

  const links =
    readJson(
      productLinksFile,
      null
    );

  if (
    !Array.isArray(links)
  ) {
    throw new Error(
      "product-links.json must contain an array."
    );
  }

  return links;
}


function loadDiscoveryReport() {
  if (
    !fs.existsSync(
      discoveryReportFile
    )
  ) {
    throw new Error(
      "discovery-report.json is missing."
    );
  }

  const report =
    readJson(
      discoveryReportFile,
      null
    );

  if (!report) {
    throw new Error(
      "discovery-report.json is invalid."
    );
  }

  return report;
}


function loadScraperReport() {
  if (
    !fs.existsSync(
      scraperReportFile
    )
  ) {
    throw new Error(
      "scraper-report.json is missing."
    );
  }

  const report =
    readJson(
      scraperReportFile,
      null
    );

  if (!report) {
    throw new Error(
      "scraper-report.json is invalid."
    );
  }

  return report;
}


/*
=========================================================
 DISCOVERY IDS
=========================================================
*/

function buildDiscoveredIds(links) {
  const ids =
    new Set();

  for (
    const item of links
  ) {
    const href =
      typeof item ===
      "string"
        ? item
        : item?.href;

    const id =
      normalizeId(
        item?.sawa9lyId ||
        productIdFromUrl(
          href
        )
      );

    if (id) {
      ids.add(id);
    }
  }

  return ids;
}


/*
=========================================================
 SCRAPER SAFETY
=========================================================
*/

function validateScraperSafety(
  rawProducts,
  discoveredIds,
  discoveryReport,
  scraperReport
) {
  if (
    discoveryReport.complete !==
    true
  ) {
    throw new Error(
      "Discovery is not complete. Generation stopped."
    );
  }

  if (
    discoveryReport.availabilitySafe !==
    true
  ) {
    throw new Error(
      "Discovery is not availability-safe. Generation stopped."
    );
  }

  if (
    scraperReport.safeToPublish !==
    true
  ) {
    throw new Error(
      "Scraper marked this run as unsafe to publish."
    );
  }

  const reportScraped =
    Number(
      scraperReport.scraped ?? 0
    );

  if (
    reportScraped !==
    rawProducts.length
  ) {
    throw new Error(
      `Scraper mismatch: report says ${reportScraped} products, raw file contains ${rawProducts.length}.`
    );
  }

  const discoveredCount =
    Number(
      discoveryReport.uniqueProductsFound ??
      discoveryReport.discovered ??
      discoveryReport.productsFound ??
      discoveredIds.size
    );

  if (
    discoveredCount > 0 &&
    rawProducts.length === 0
  ) {
    throw new Error(
      "Discovery found products but scraper returned zero products."
    );
  }

  const coverage =
    Number(
      scraperReport.coverage ?? 0
    );

  const minimumCoverage =
    Number(
      config.automation
        .minimumCoveragePercent ?? 70
    ) / 100;

  if (
    coverage <
    minimumCoverage
  ) {
    throw new Error(
      `Unsafe scraper coverage: ${(coverage * 100).toFixed(2)}%. Required: ${(minimumCoverage * 100).toFixed(2)}%.`
    );
  }

  /*
  إذا كان عدد المنتجات المكتشفة
  أكبر من scrapeLimit، لا نسمح
  بتوليد قاعدة جزئية.

  scraper.js نفسه يجب أن يوقف العملية،
  لكن هذا فحص إضافي.
  */

  if (
    scraperReport.fullCatalogSelected ===
    false
  ) {
    throw new Error(
      "Scraper did not process the full discovered catalog."
    );
  }
}


/*
=========================================================
 RAW PRODUCT MAP
=========================================================
*/

function buildRawProductMap(
  rawProducts
) {
  const map =
    new Map();

  for (
    const product of
      rawProducts
  ) {
    const id =
      normalizeId(
        product?.sawa9lyId ||
        productIdFromUrl(
          product?.sawa9lyLink
        )
      );

    if (!id) {
      continue;
    }

    /*
    المنتج يجب ألا يكون
    مكررًا في نتيجة scraper.
    */

    if (
      map.has(id)
    ) {
      throw new Error(
        `Duplicate scraped sawa9lyId detected: ${id}`
      );
    }

    map.set(
      id,
      {
        ...product,
        sawa9lyId: id,
      }
    );
  }

  return map;
}


/*
=========================================================
 PRODUCTS.JS PARSER
=========================================================

المشكلة القديمة:
JSON.parse() يفشل إذا كان الملف
يحتوي JavaScript صالحًا ولكنه ليس
JSON حرفيًا.

نستخدم هنا استخراجًا حقيقيًا
للمصفوفة مع احترام:
- strings
- escapes
- brackets
- comments

ثم نحاول JSON.parse.
=========================================================
*/


function findArrayStart(
  source
) {
  const patterns = [
    /export\s+default\s*/,
    /export\s+(?:const|let|var)\s+products\s*=\s*/,
    /(?:const|let|var)\s+products\s*=\s*/,
    /module\.exports\s*=\s*/,
  ];

  for (
    const pattern of
      patterns
  ) {
    const match =
      pattern.exec(
        source
      );

    if (!match) {
      continue;
    }

    const start =
      source.indexOf(
        "[",
        match.index +
          match[0].length
      );

    if (
      start !== -1
    ) {
      return start;
    }
  }

  return -1;
}


function findMatchingBracket(
  source,
  start
) {
  if (
    source[start] !== "["
  ) {
    return -1;
  }

  let depth = 0;

  let quote = null;

  let escaped = false;

  let lineComment = false;

  let blockComment = false;

  for (
    let i = start;
    i < source.length;
    i++
  ) {
    const char =
      source[i];

    const next =
      source[i + 1];

    if (
      lineComment
    ) {
      if (
        char === "\n"
      ) {
        lineComment = false;
      }

      continue;
    }

    if (
      blockComment
    ) {
      if (
        char === "*" &&
        next === "/"
      ) {
        blockComment = false;
        i++;
      }

      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (
        char === "\\"
      ) {
        escaped = true;
        continue;
      }

      if (
        char === quote
      ) {
        quote = null;
      }

      continue;
    }

    if (
      char === "/" &&
      next === "/"
    ) {
      lineComment = true;
      i++;
      continue;
    }

    if (
      char === "/" &&
      next === "*"
    ) {
      blockComment = true;
      i++;
      continue;
    }

    if (
      char === '"' ||
      char === "'" ||
      char === "`"
    ) {
      quote = char;
      continue;
    }

    if (
      char === "["
    ) {
      depth++;
      continue;
    }

    if (
      char === "]"
    ) {
      depth--;

      if (
        depth === 0
      ) {
        return i;
      }
    }
  }

  return -1;
}


/*
---------------------------------------------------------
 إزالة trailing commas
---------------------------------------------------------
*/

function removeTrailingCommas(
  text
) {
  let result = "";

  let quote = null;

  let escaped = false;

  let lineComment = false;

  let blockComment = false;

  for (
    let i = 0;
    i < text.length;
    i++
  ) {
    const char =
      text[i];

    const next =
      text[i + 1];

    if (
      lineComment
    ) {
      result += char;

      if (
        char === "\n"
      ) {
        lineComment = false;
      }

      continue;
    }

    if (
      blockComment
    ) {
      result += char;

      if (
        char === "*" &&
        next === "/"
      ) {
        result += next;
        i++;
        blockComment = false;
      }

      continue;
    }

    if (quote) {
      result += char;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (
        char === "\\"
      ) {
        escaped = true;
        continue;
      }

      if (
        char === quote
      ) {
        quote = null;
      }

      continue;
    }

    if (
      char === "/" &&
      next === "/"
    ) {
      result += char;
      result += next;
      i++;
      lineComment = true;
      continue;
    }

    if (
      char === "/" &&
      next === "*"
    ) {
      result += char;
      result += next;
      i++;
      blockComment = true;
      continue;
    }

    if (
      char === '"' ||
      char === "'" ||
      char === "`"
    ) {
      quote = char;
      result += char;
      continue;
    }

    if (
      char === ","
    ) {
      let j =
        i + 1;

      while (
        j < text.length &&
        /\s/.test(
          text[j]
        )
      ) {
        j++;
      }

      if (
        text[j] === "]" ||
        text[j] === "}"
      ) {
        continue;
      }
    }

    result += char;
  }

  return result;
}


/*
---------------------------------------------------------
 استخراج products.js
---------------------------------------------------------
*/

function parseProductsJs(
  source
) {
  const text =
    String(source || "");

  const start =
    findArrayStart(
      text
    );

  if (
    start === -1
  ) {
    return null;
  }

  const end =
    findMatchingBracket(
      text,
      start
    );

  if (
    end === -1
  ) {
    return null;
  }

  let arrayText =
    text.slice(
      start,
      end + 1
    );

  /*
  المحاولة الأولى:
  JSON مباشر.
  */

  try {
    const parsed =
      JSON.parse(
        arrayText
      );

    if (
      Array.isArray(parsed)
    ) {
      return parsed;
    }
  } catch {
    // Continue.
  }

  /*
  المحاولة الثانية:
  إزالة trailing commas.
  */

  arrayText =
    removeTrailingCommas(
      arrayText
    );

  try {
    const parsed =
      JSON.parse(
        arrayText
      );

    if (
      Array.isArray(parsed)
    ) {
      return parsed;
    }
  } catch {
    // Continue.
  }

  return null;
}


/*
=========================================================
 READ EXISTING PRODUCTS
=========================================================
*/

function loadExistingProducts() {
  if (
    !fs.existsSync(
      productsFile
    )
  ) {
    console.warn(
      `⚠️ products.js does not exist yet: ${productsFile}`
    );

    return [];
  }

  const source =
    fs.readFileSync(
      productsFile,
      "utf8"
    );

  const products =
    parseProductsJs(
      source
    );

  if (
    !Array.isArray(
      products
    )
  ) {
    throw new Error(
      "Could not safely parse products.js. Generation stopped to protect the database."
    );
  }

  return products;
}


/*
=========================================================
 PRODUCT TYPE
=========================================================
*/

function isAutomatedProduct(
  product
) {
  if (!product) {
    return false;
  }

  if (
    product.automated === true
  ) {
    return true;
  }

  if (
    product.sawa9lyId
  ) {
    return true;
  }

  if (
    product.sawa9lyLink
  ) {
    return true;
  }

  return false;
}


function isManualProduct(
  product
) {
  return !isAutomatedProduct(
    product
  );
}


/*
=========================================================
 VALIDATE SCRAPED PRODUCT
=========================================================
*/

function validateScrapedProduct(
  product
) {
  const id =
    normalizeId(
      product?.sawa9lyId
    );

  if (!id) {
    return {
      valid: false,
      reason:
        "missing sawa9lyId",
    };
  }

  const name =
    cleanText(
      product?.name
    );

  if (!name) {
    return {
      valid: false,
      reason:
        "missing name",
    };
  }

  const basePrice =
    Number(
      product?.basePrice
    );

  if (
    !isValidPrice(
      basePrice
    )
  ) {
    return {
      valid: false,
      reason:
        "invalid basePrice",
    };
  }

  const images =
    normalizeImages(
      product
    );

  if (
    images.length === 0
  ) {
    return {
      valid: false,
      reason:
        "missing images",
    };
  }

  return {
    valid: true,
  };
}


/*
=========================================================
 NORMALIZE SCRAPED PRODUCT
=========================================================
*/

function normalizeScrapedProduct(
  product
) {
  const id =
    normalizeId(
      product.sawa9lyId
    );

  const images =
    normalizeImages(
      product
    );

  const basePrice =
    Math.round(
      Number(
        product.basePrice
      )
    );

  const sellingPrice =
    Math.round(
      Number(
        product.sellingPrice || 0
      )
    );

  const profit =
    Math.round(
      Number(
        product.profit || 0
      )
    );

  const link =
    normalizeProductUrl(
      product.sawa9lyLink ||
      `https://affiliate.sawa9ly.pro/store/${id}`
    );

  return {
    sawa9lyId:
      id,

    name:
      cleanText(
        product.name
      ),

    description:
      cleanText(
        product.description
      ),

    basePrice,

    sellingPrice,

    profit,

    image:
      images[0] || "",

    images,

    sawa9lyLink:
      link,

    available:
      true,

    automated:
      true,

    updatedAt:
      new Date().toISOString(),

    scrapedAt:
      product.scrapedAt ||
      new Date().toISOString(),
  };
}


/*
=========================================================
 MERGE SCRAPED -> EXISTING
=========================================================
*/

function mergeScrapedIntoExisting(
  existing,
  scraped
) {
  const merged = {
    /*
    نحافظ على جميع الحقول القديمة.
    */

    ...existing,

    /*
    ثم نحدث الحقول الآلية.
    */

    sawa9lyId:
      scraped.sawa9lyId,

    name:
      scraped.name,

    description:
      scraped.description,

    basePrice:
      scraped.basePrice,

    sellingPrice:
      scraped.sellingPrice,

    profit:
      scraped.profit,

    image:
      scraped.image,

    images:
      scraped.images,

    sawa9lyLink:
      scraped.sawa9lyLink,

    available:
      true,

    automated:
      true,

    updatedAt:
      new Date().toISOString(),

    scrapedAt:
      scraped.scrapedAt,
  };

  /*
  إذا كان الموقع القديم
  يستعمل price بدل sellingPrice،
  نحافظ على price أيضًا.
  */

  if (
    Object.prototype.hasOwnProperty.call(
      existing,
      "price"
    )
  ) {
    merged.price =
      scraped.sellingPrice;
  }

  return merged;
}


/*
=========================================================
 MARK UNAVAILABLE
=========================================================
*/

function markUnavailable(
  product
) {
  return {
    ...product,

    available:
      false,

    /*
    لا نغير:
    - name
    - image
    - images
    - basePrice
    - sellingPrice
    - profit
    - sawa9lyLink
    */

    unavailableSince:
      product.unavailableSince ||
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString(),

    automated:
      true,
  };
}


/*
=========================================================
 RESTORE
=========================================================
*/

function restoreProduct(
  existing,
  scraped
) {
  const merged =
    mergeScrapedIntoExisting(
      existing,
      scraped
    );

  /*
  نحذف unavailableSince
  فعليًا من الكائن.
  */

  delete merged.unavailableSince;

  merged.available =
    true;

  if (
    existing.available ===
    false
  ) {
    merged.restoredAt =
      new Date().toISOString();
  }

  return merged;
}


/*
=========================================================
 REMOVE UNDEFINED
=========================================================
*/

function removeUndefined(
  object
) {
  const result = {};

  for (
    const [key, value]
      of Object.entries(
        object
      )
  ) {
    if (
      value !== undefined
    ) {
      result[key] =
        value;
    }
  }

  return result;
}


/*
=========================================================
 MERGE DATABASE
=========================================================
*/

function mergeProducts(
  existingProducts,
  scrapedProducts,
  discoveredIds,
  confirmedMissingIds
) {
  const scrapedMap =
    buildRawProductMap(
      scrapedProducts
    );

  const finalProducts =
    [];

  const existingIds =
    new Set();

  let updated = 0;
  let restored = 0;
  let unavailable = 0;
  let unchanged = 0;
  let manual = 0;
  let newProducts = 0;

  /*
  ========================================================
  المرحلة 1:
  المنتجات الموجودة.
  ========================================================
  */

  for (
    const existingRaw
      of existingProducts
  ) {
    const existing =
      removeUndefined(
        existingRaw
      );

    const id =
      normalizeId(
        existing?.sawa9lyId ||
        productIdFromUrl(
          existing?.sawa9lyLink
        )
      );

    /*
    منتج يدوي.
    */

    if (!id) {
      finalProducts.push(
        existing
      );

      manual++;

      continue;
    }

    existingIds.add(id);

    /*
    المنتج ظهر في scraping الحالي.
    */

    const scraped =
      scrapedMap.get(id);

    if (scraped) {
      const validation =
        validateScrapedProduct(
          scraped
        );

      if (
        !validation.valid
      ) {
        finalProducts.push(
          existing
        );

        unchanged++;

        continue;
      }

      const normalized =
        normalizeScrapedProduct(
          scraped
        );

      const wasUnavailable =
        existing.available ===
        false;

      const merged =
        wasUnavailable
          ? restoreProduct(
              existing,
              normalized
            )
          : mergeScrapedIntoExisting(
              existing,
              normalized
            );

      finalProducts.push(
        removeUndefined(
          merged
        )
      );

      if (
        wasUnavailable
      ) {
        restored++;
      } else {
        updated++;
      }

      continue;
    }

    /*
    ======================================================
    المنتج لم ينجح scraping.

    مهم جدًا:
    فشل scraping لا يعني اختفاء المنتج.
    ======================================================
    */

    finalProducts.push(
      existing
    );

    unchanged++;
  }

  /*
  ========================================================
  المرحلة 2:
  المنتجات الجديدة.
  ========================================================
  */

  for (
    const [
      id,
      scraped
    ] of scrapedMap
  ) {
    if (
      existingIds.has(id)
    ) {
      continue;
    }

    const validation =
      validateScrapedProduct(
        scraped
      );

    if (
      !validation.valid
    ) {
      continue;
    }

    const normalized =
      normalizeScrapedProduct(
        scraped
      );

    finalProducts.push(
      normalized
    );

    newProducts++;
  }

  /*
  ========================================================
  المرحلة 3:
  المنتجات المختفية.

  لا نعتمد على مجرد عدم وجودها.
  نعتمد فقط على confirmedMissingIds
  القادم من discover.js.
  ========================================================
  */

  for (
    let index = 0;
    index < finalProducts.length;
    index++
  ) {
    const product =
      finalProducts[index];

    const id =
      normalizeId(
        product?.sawa9lyId
      );

    if (!id) {
      continue;
    }

    /*
    ظهر الآن؟
    إذن متوفر مهما كان تقرير missing.
    */

    if (
      scrapedMap.has(id)
    ) {
      continue;
    }

    /*
    غير مؤكد اختفاؤه؟
    لا نلمسه.
    */

    if (
      !confirmedMissingIds.has(
        id
      )
    ) {
      continue;
    }

    /*
    لا نلمس المنتجات اليدوية.
    */

    if (
      isManualProduct(
        product
      )
    ) {
      continue;
    }

    /*
    لا نعيد كتابة unavailable
    كل يوم بلا داع.
    */

    if (
      product.available !==
      false
    ) {
      finalProducts[index] =
        markUnavailable(
          product
        );

      unavailable++;
    }
  }

  return {
    products:
      finalProducts,

    stats: {
      total:
        finalProducts.length,

      updated,

      restored,

      unavailable,

      unchanged,

      manual,

      newProducts,
    },
  };
}


/*
=========================================================
 FINAL DATABASE VALIDATION
=========================================================
*/

function validateFinalProducts(
  products,
  existingProducts,
  discoveredIds
) {
  if (
    !Array.isArray(
      products
    )
  ) {
    throw new Error(
      "Final products is not an array."
    );
  }

  /*
  لا يجوز إنشاء قاعدة فارغة.
  */

  if (
    existingProducts.length >
      0 &&
    products.length === 0
  ) {
    throw new Error(
      "Safety stop: generated products database would be empty."
    );
  }

  /*
  العدد لا يجب أن ينخفض.
  */

  if (
    products.length <
    existingProducts.length
  ) {
    throw new Error(
      `Safety stop: product count decreased from ${existingProducts.length} to ${products.length}.`
    );
  }

  const ids =
    new Set();

  for (
    const product
      of products
  ) {
    if (
      !product ||
      typeof product !==
        "object"
    ) {
      throw new Error(
        "Invalid product object detected."
      );
    }

    const id =
      normalizeId(
        product.sawa9lyId
      );

    /*
    المنتج اليدوي يمكن ألا
    يملك Sawa9ly ID.
    */

    if (!id) {
      continue;
    }

    if (
      ids.has(id)
    ) {
      throw new Error(
        `Duplicate sawa9lyId in final database: ${id}`
      );
    }

    ids.add(id);
  }

  /*
  لا نتحقق أن كل discovered ID
  موجود في products النهائي،
  لأن المنتج قد يفشل scraping.
  في هذه الحالة يجب أن يبقى
  المنتج القديم كما هو.
  */

  if (
    discoveredIds.size > 0 &&
    existingProducts.length === 0 &&
    ids.size === 0
  ) {
    throw new Error(
      "Discovery found products but final database contains no automated products."
    );
  }
}


/*
=========================================================
 BUILD products.js
=========================================================
*/

function buildProductsJs(
  products
) {
  const json =
    JSON.stringify(
      products,
      null,
      2
    );

  return `/*
 * PRIX CHOC
 * Automated Sawa9ly product catalog
 *
 * Generated automatically.
 * Do not manually edit automated products.
 *
 * Last update:
 * ${new Date().toISOString()}
 */

const products = ${json};

export default products;
`;
}


/*
=========================================================
 BACKUP
=========================================================
*/

function createBackup() {
  if (
    !fs.existsSync(
      productsFile
    )
  ) {
    return false;
  }

  fs.copyFileSync(
    productsFile,
    backupProductsFile
  );

  return true;
}


/*
=========================================================
 ATOMIC WRITE
=========================================================
*/

function writeProductsAtomic(
  content
) {
  const directory =
    path.dirname(
      productsFile
    );

  fs.mkdirSync(
    directory,
    {
      recursive: true,
    }
  );

  const tempFile =
    `${productsFile}.tmp`;

  fs.writeFileSync(
    tempFile,
    content,
    "utf8"
  );

  /*
  إذا وصلنا هنا فالملف
  المؤقت كتب بنجاح.
  */

  fs.renameSync(
    tempFile,
    productsFile
  );
}


/*
=========================================================
 POST-WRITE VALIDATION
=========================================================
*/

function validateGeneratedFile(
  expectedCount
) {
  if (
    !fs.existsSync(
      productsFile
    )
  ) {
    throw new Error(
      "Generated products.js does not exist."
    );
  }

  const source =
    fs.readFileSync(
      productsFile,
      "utf8"
    );

  if (
    !source.includes(
      "const products"
    )
  ) {
    throw new Error(
      "Generated products.js does not contain products declaration."
    );
  }

  if (
    !source.includes(
      "export default products"
    )
  ) {
    throw new Error(
      "Generated products.js does not contain the expected export."
    );
  }

  const generated =
    parseProductsJs(
      source
    );

  if (
    !Array.isArray(
      generated
    )
  ) {
    throw new Error(
      "Generated products.js could not be parsed after writing."
    );
  }

  if (
    generated.length !==
    expectedCount
  ) {
    throw new Error(
      `Post-write validation failed: expected ${expectedCount}, got ${generated.length}.`
    );
  }

  /*
  فحص duplicate IDs بعد الكتابة.
  */

  const ids =
    new Set();

  for (
    const product
      of generated
  ) {
    const id =
      normalizeId(
        product?.sawa9lyId
      );

    if (!id) {
      continue;
    }

    if (
      ids.has(id)
    ) {
      throw new Error(
        `Post-write duplicate sawa9lyId: ${id}`
      );
    }

    ids.add(id);
  }

  return generated;
}


/*
=========================================================
 MAIN
=========================================================
*/

function main() {
  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    " PRIX CHOC - PRODUCT GENERATOR"
  );
  console.log(
    "=================================================="
  );
  console.log("");

  /*
  --------------------------------------------------------
  1. Load source files
  --------------------------------------------------------
  */

  const rawProducts =
    loadRawProducts();

  const links =
    loadProductLinks();

  const discoveredIds =
    buildDiscoveredIds(
      links
    );

  const discoveryReport =
    loadDiscoveryReport();

  const scraperReport =
    loadScraperReport();

  /*
  --------------------------------------------------------
  2. Safety validation
  --------------------------------------------------------
  */

  validateScraperSafety(
    rawProducts,
    discoveredIds,
    discoveryReport,
    scraperReport
  );

  /*
  --------------------------------------------------------
  3. Confirmed missing IDs
  --------------------------------------------------------
  */

  const confirmedMissingIds =
    new Set(
      Array.isArray(
        discoveryReport.confirmedMissingIds
      )
        ? discoveryReport.confirmedMissingIds
            .map(normalizeId)
            .filter(Boolean)
        : []
    );

  /*
  --------------------------------------------------------
  4. Existing products
  --------------------------------------------------------
  */

  const existingProducts =
    loadExistingProducts();

  console.log(
    `📚 Existing products : ${existingProducts.length}`
  );

  console.log(
    `🔎 Discovered        : ${discoveredIds.size}`
  );

  console.log(
    `🕷️ Scraped           : ${rawProducts.length}`
  );

  console.log(
    `❌ Confirmed missing : ${confirmedMissingIds.size}`
  );

  /*
  --------------------------------------------------------
  5. Backup
  --------------------------------------------------------
  */

  const backupCreated =
    createBackup();

  if (
    backupCreated
  ) {
    console.log(
      `🛡️ Backup created    : ${backupProductsFile}`
    );
  }

  /*
  --------------------------------------------------------
  6. Merge
  --------------------------------------------------------
  */

  const result =
    mergeProducts(
      existingProducts,
      rawProducts,
      discoveredIds,
      confirmedMissingIds
    );

  const finalProducts =
    result.products;

  /*
  --------------------------------------------------------
  7. Final safety
  --------------------------------------------------------
  */

  validateFinalProducts(
    finalProducts,
    existingProducts,
    discoveredIds
  );

  /*
  --------------------------------------------------------
  8. Build
  --------------------------------------------------------
  */

  const content =
    buildProductsJs(
      finalProducts
    );

  /*
  --------------------------------------------------------
  9. Atomic write
  --------------------------------------------------------
  */

  writeProductsAtomic(
    content
  );

  /*
  --------------------------------------------------------
  10. Validate generated file
  --------------------------------------------------------
  */

  const generated =
    validateGeneratedFile(
      finalProducts.length
    );

  /*
  --------------------------------------------------------
  11. Report
  --------------------------------------------------------
  */

  const report = {
    generatedAt:
      new Date().toISOString(),

    existingBefore:
      existingProducts.length,

    discovered:
      discoveredIds.size,

    scraped:
      rawProducts.length,

    final:
      finalProducts.length,

    updated:
      result.stats.updated,

    newProducts:
      result.stats.newProducts,

    restored:
      result.stats.restored,

    unavailable:
      result.stats.unavailable,

    unchanged:
      result.stats.unchanged,

    manual:
      result.stats.manual,

    confirmedMissing:
      confirmedMissingIds.size,

    backupCreated,

    productsFile,
  };

  writeJson(
    generatorReportFile,
    report
  );

  /*
  --------------------------------------------------------
  12. Output
  --------------------------------------------------------
  */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    " GENERATOR FINISHED SAFELY"
  );
  console.log(
    "=================================================="
  );

  console.log(
    `📚 Before          : ${existingProducts.length}`
  );

  console.log(
    `🔎 Discovered      : ${discoveredIds.size}`
  );

  console.log(
    `🕷️ Scraped         : ${rawProducts.length}`
  );

  console.log(
    `➕ New             : ${result.stats.newProducts}`
  );

  console.log(
    `🔄 Updated         : ${result.stats.updated}`
  );

  console.log(
    `♻️ Restored        : ${result.stats.restored}`
  );

  console.log(
    `🚫 Unavailable     : ${result.stats.unavailable}`
  );

  console.log(
    `⏸️ Unchanged       : ${result.stats.unchanged}`
  );

  console.log(
    `🧑 Manual          : ${result.stats.manual}`
  );

  console.log(
    `📦 Final           : ${generated.length}`
  );

  console.log("");

  console.log(
    `📄 products.js     : ${productsFile}`
  );

  console.log(
    `📄 generator report: ${generatorReportFile}`
  );

  console.log("");

  console.log(
    "✅ Generation completed successfully."
  );
}


/*
=========================================================
 ERROR HANDLER
=========================================================
*/

try {
  main();
} catch (error) {
  console.error("");
  console.error(
    "=================================================="
  );
  console.error(
    " GENERATOR ERROR"
  );
  console.error(
    "=================================================="
  );

  console.error(
    error?.stack ||
    error?.message ||
    error
  );

  console.error("");

  process.exit(1);
}
