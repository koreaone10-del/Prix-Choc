import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { config, validateConfig } from "./config.js";

validateConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   PRIX CHOC
   SAWA9LY PRODUCT GENERATOR
   =========================================================

   الهدف:

   - إضافة المنتجات الجديدة
   - تحديث المنتجات الموجودة
   - تحديث السعر تلقائيا
   - تحديث الصور تلقائيا
   - الاحتفاظ بكل الصور
   - عدم حذف أي منتج من products.js
   - جعل المنتج غير متوفر عند اختفائه
   - إعادة المنتج تلقائيا عند عودته
   - الحفاظ على المنتجات اليدوية
   - منع الكتابة عند وجود scraping غير آمن
   - الحفاظ على ترتيب المنتجات الحالي قدر الإمكان

   مهم:
   generator.js لا يتصل بـ Sawa9ly.
   هو يعتمد على:
      products.raw.json
      product-links.json
      discovery-report.json
      scraper-report.json
   ========================================================= */


/* =========================================================
   PATHS
   ========================================================= */

const outputDir =
  config?.paths?.outputDir
    ? path.resolve(config.paths.outputDir)
    : path.join(__dirname, "output");

const debugDir =
  config?.paths?.debugDir
    ? path.resolve(config.paths.debugDir)
    : path.join(__dirname, "debug");

const rawProductsFile =
  path.join(
    outputDir,
    "products.raw.json"
  );

const productsFile =
  config?.paths?.productsFile
    ? path.resolve(config.paths.productsFile)
    : path.resolve(
        __dirname,
        "../products.js"
      );

const productLinksFile =
  path.join(
    debugDir,
    "product-links.json"
  );

const discoveryReportFile =
  path.join(
    debugDir,
    "discovery-report.json"
  );

const scraperReportFile =
  path.join(
    debugDir,
    "scraper-report.json"
  );

const generatorReportFile =
  path.join(
    debugDir,
    "generator-report.json"
  );

const backupProductsFile =
  path.join(
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


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\t+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function readJson(
  file,
  fallback = null
) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch {
    return fallback;
  }
}


function writeJson(
  file,
  data
) {
  fs.writeFileSync(
    file,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
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
    ? match[0]
    : "";
}


function productIdFromUrl(value) {
  const match =
    String(value || "").match(
      /\/(?:store|product)\/(\d+)/i
    );

  return match
    ? match[1]
    : "";
}


function normalizeProductUrl(
  value
) {
  const id =
    productIdFromUrl(value);

  if (!id) {
    return "";
  }

  const base =
    config?.sawa9ly?.baseUrl ||
    "https://affiliate.sawa9ly.pro";

  return `${base.replace(
    /\/+$/,
    ""
  )}/store/${id}`;
}


/* =========================================================
   JAVASCRIPT STRING SAFETY
   ========================================================= */

function jsString(value) {
  return JSON.stringify(
    value === undefined ||
      value === null
      ? ""
      : String(value)
  );
}


function jsValue(value) {
  return JSON.stringify(
    value,
    null,
    2
  );
}


/* =========================================================
   VALIDATION
   ========================================================= */

function isValidPrice(value) {
  const number =
    Number(value);

  return (
    Number.isFinite(number) &&
    number > 0 &&
    number < 100000000
  );
}


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


/* =========================================================
   IMAGE NORMALIZATION
   ========================================================= */

function normalizeImages(
  product
) {
  const result = [];

  const add = value => {
    if (!isValidImage(value)) {
      return;
    }

    const text =
      String(value).trim();

    if (!result.includes(text)) {
      result.push(text);
    }
  };

  /*
    الصورة الرئيسية أولا.
  */

  add(product?.image);

  /*
    ثم الصور الإضافية.
  */

  if (
    Array.isArray(product?.images)
  ) {
    for (
      const image of product.images
    ) {
      add(image);
    }
  }

  /*
    الحد الأقصى 20 صورة.
  */

  return result.slice(0, 20);
}


/* =========================================================
   LOAD RAW SCRAPED PRODUCTS
   ========================================================= */

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

  const raw =
    readJson(
      rawProductsFile,
      null
    );

  if (!Array.isArray(raw)) {
    throw new Error(
      "products.raw.json must contain an array."
    );
  }

  return raw;
}


/* =========================================================
   LOAD DISCOVERED PRODUCT IDS
   ========================================================= */

function loadDiscoveredIds() {
  if (
    !fs.existsSync(
      productLinksFile
    )
  ) {
    throw new Error(
      `Missing discovery file: ${productLinksFile}`
    );
  }

  const links =
    readJson(
      productLinksFile,
      null
    );

  if (!Array.isArray(links)) {
    throw new Error(
      "product-links.json must contain an array."
    );
  }

  const ids =
    new Set();

  for (const item of links) {
    const href =
      typeof item === "string"
        ? item
        : item?.href;

    const id =
      normalizeId(
        item?.sawa9lyId ||
        productIdFromUrl(href)
      );

    if (id) {
      ids.add(id);
    }
  }

  return ids;
}


/* =========================================================
   LOAD REPORTS
   ========================================================= */

function loadDiscoveryReport() {
  return readJson(
    discoveryReportFile,
    null
  );
}


function loadScraperReport() {
  return readJson(
    scraperReportFile,
    null
  );
}


/* =========================================================
   SCRAPER SAFETY
   ========================================================= */

function validateScraperSafety(
  rawProducts,
  discoveredIds,
  scraperReport
) {
  if (!scraperReport) {
    throw new Error(
      "scraper-report.json is missing."
    );
  }

  if (
    scraperReport.safeToPublish === false
  ) {
    throw new Error(
      "Scraper marked this run as unsafe to publish."
    );
  }

  const scrapedCount =
    rawProducts.length;

  const reportCount =
    Number(
      scraperReport.scraped || 0
    );

  if (
    reportCount > 0 &&
    scrapedCount !== reportCount
  ) {
    throw new Error(
      `Scraper report mismatch: report=${reportCount}, file=${scrapedCount}.`
    );
  }

  /*
    لا نسمح بأن تكون لدينا
    قائمة discovery كبيرة جدا
    ولكن scraper أعاد صفرا.
  */

  if (
    discoveredIds.size > 0 &&
    rawProducts.length === 0
  ) {
    throw new Error(
      "Discovery found products but scraper returned zero products."
    );
  }

  /*
    إذا كانت التغطية أقل من 70%
    نوقف generator.
  */

  const coverage =
    Number(
      scraperReport.coverage || 0
    );

  if (
    coverage < 0.70
  ) {
    throw new Error(
      `Unsafe scraper coverage: ${(coverage * 100).toFixed(2)}%.`
    );
  }
}


/* =========================================================
   RAW PRODUCT MAP
   ========================================================= */

function buildRawProductMap(
  rawProducts
) {
  const map =
    new Map();

  for (
    const product of rawProducts
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
      لا نسمح بتكرار ID.
      آخر نسخة صالحة تفوز.
    */

    map.set(
      id,
      {
        ...product,
        sawa9lyId: id
      }
    );
  }

  return map;
}


/* =========================================================
   READ EXISTING products.js
   ========================================================= */

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

  /*
    products.js الحالي عبارة عن
    JavaScript object/array.

    نحاول استخراج export/default
    بطريقة آمنة بدون تنفيذ الملف
    داخل generator.
  */

  const parsed =
    parseProductsJs(
      source
    );

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Could not parse existing products.js as an array."
    );
  }

  return parsed;
}


/* =========================================================
   PRODUCTS.JS PARSER
   ========================================================= */

function parseProductsJs(
  source
) {
  const text =
    String(source || "");

  /*
    الطريقة الأولى:
    export default [...]
  */

  let match =
    text.match(
      /export\s+default\s+(\[[\s\S]*\])\s*;?\s*$/m
    );

  if (match) {
    try {
      return JSON.parse(
        match[1]
      );
    } catch {
      /*
        ننتقل للطريقة التالية.
      */
    }
  }

  /*
    const products = [...]
  */

  match =
    text.match(
      /(?:const|let|var)\s+products\s*=\s*(\[[\s\S]*?\])\s*;/
    );

  if (match) {
    try {
      return JSON.parse(
        match[1]
      );
    } catch {}
  }

  /*
    module.exports = [...]
  */

  match =
    text.match(
      /module\.exports\s*=\s*(\[[\s\S]*\])\s*;?\s*$/
    );

  if (match) {
    try {
      return JSON.parse(
        match[1]
      );
    } catch {}
  }

  /*
    في حال كان الملف يستخدم:
    export const products = [...]
  */

  match =
    text.match(
      /export\s+(?:const|let|var)\s+products\s*=\s*(\[[\s\S]*?\])\s*;/
    );

  if (match) {
    try {
      return JSON.parse(
        match[1]
      );
    } catch {}
  }

  return null;
}


/* =========================================================
   IMPORTANT:
   PARSER FALLBACK FOR products.js
   ========================================================= */

function parseExistingProducts(
  source
) {
  const parsed =
    parseProductsJs(
      source
    );

  if (Array.isArray(parsed)) {
    return parsed;
  }

  /*
    المنتجات الحالية قد تحتوي
    على trailing commas أو JS formatting
    لا يسمح JSON.parse به.

    لذلك نحاول استخراج blocks
    للمنتجات.
  */

  const products =
    [];

  const objectMatches =
    source.match(
      /\{[\s\S]*?\}/g
    ) || [];

  for (
    const objectText of objectMatches
  ) {
    if (
      !/sawa9lyId/i.test(
        objectText
      )
    ) {
      continue;
    }

    const idMatch =
      objectText.match(
        /sawa9lyId\s*:\s*["'`](\d+)["'`]/
      );

    if (!idMatch) {
      continue;
    }

    const id =
      idMatch[1];

    const nameMatch =
      objectText.match(
        /name\s*:\s*["'`]([\s\S]*?)["'`]/
      );

    const imageMatch =
      objectText.match(
        /image\s*:\s*["'`](.*?)["'`]/
      );

    const priceMatch =
      objectText.match(
        /(?:basePrice|price)\s*:\s*(\d+)/
      );

    products.push({
      sawa9lyId: id,

      name:
        nameMatch
          ? nameMatch[1]
          : `Produit ${id}`,

      image:
        imageMatch
          ? imageMatch[1]
          : "",

      basePrice:
        priceMatch
          ? Number(
              priceMatch[1]
            )
          : 0,

      automated: true
    });
  }

  return products;
}


/* =========================================================
   LOAD EXISTING PRODUCTS WITH FALLBACK
   ========================================================= */

function getExistingProducts() {
  if (
    !fs.existsSync(
      productsFile
    )
  ) {
    return [];
  }

  const source =
    fs.readFileSync(
      productsFile,
      "utf8"
    );

  let parsed =
    parseProductsJs(
      source
    );

  if (
    Array.isArray(parsed)
  ) {
    return parsed;
  }

  parsed =
    parseExistingProducts(
      source
    );

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0
  ) {
    throw new Error(
      "Could not safely read existing products.js. Generation stopped to protect the product database."
    );
  }

  return parsed;
}


/* =========================================================
   AUTOMATED PRODUCT DETECTION
   ========================================================= */

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


/* =========================================================
   MANUAL PRODUCT DETECTION
   ========================================================= */

function isManualProduct(
  product
) {
  return !isAutomatedProduct(
    product
  );
}


/* =========================================================
   VALID SCRAPED PRODUCT
   ========================================================= */

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
      reason: "missing sawa9lyId"
    };
  }

  const name =
    cleanText(
      product?.name
    );

  if (!name) {
    return {
      valid: false,
      reason: "missing name"
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
      reason: "invalid basePrice"
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
      reason: "missing images"
    };
  }

  return {
    valid: true
  };
}


/* =========================================================
   NORMALIZE SCRAPED PRODUCT
   ========================================================= */

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
        product.sellingPrice ||
        0
      )
    );

  const profit =
    Math.round(
      Number(
        product.profit ||
        0
      )
    );

  return {
    sawa9lyId: id,

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
      normalizeProductUrl(
        product.sawa9lyLink ||
        `https://affiliate.sawa9ly.pro/store/${id}`
      ),

    available: true,

    automated: true,

    updatedAt:
      new Date().toISOString(),

    scrapedAt:
      product.scrapedAt ||
      new Date().toISOString()
  };
}


/* =========================================================
   MERGE PRODUCT
   ========================================================= */

function mergeScrapedIntoExisting(
  existing,
  scraped
) {
  /*
    نحافظ على أي fields إضافية
    موجودة في المنتج القديم.

    ثم نحدث البيانات القادمة
    من Sawa9ly.
  */

  const merged = {
    ...existing,

    ...scraped,

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

    available: true,

    automated: true,

    updatedAt:
      new Date().toISOString()
  };

  /*
    بعض المشاريع تستخدم price بدلا
    من sellingPrice.

    لا نحذف الحقل القديم إذا كان موجودا.
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


/* =========================================================
   MARK PRODUCT UNAVAILABLE
   ========================================================= */

function markUnavailable(
  product
) {
  return {
    ...product,

    available: false,

    /*
      لا نغير:
        name
        image
        images
        basePrice
        sellingPrice
        profit
        sawa9lyLink

      حتى يبقى المنتج ظاهرا للمستخدم
      ويمكن إعادته عندما يرجع.
    */

    unavailableSince:
      product.unavailableSince ||
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString(),

    automated:
      isAutomatedProduct(
        product
      )
        ? true
        : product.automated
  };
}


/* =========================================================
   RESTORE PRODUCT
   ========================================================= */

function restoreProduct(
  existing,
  scraped
) {
  return {
    ...mergeScrapedIntoExisting(
      existing,
      scraped
    ),

    available: true,

    unavailableSince:
      undefined,

    restoredAt:
      existing.available === false
        ? new Date().toISOString()
        : existing.restoredAt
  };
}


/* =========================================================
   CLEAN UNDEFINED FIELDS
   ========================================================= */

function removeUndefined(
  object
) {
  const result = {};

  for (
    const [key, value]
    of Object.entries(object)
  ) {
    if (
      value !== undefined
    ) {
      result[key] = value;
    }
  }

  return result;
}


/* =========================================================
   MERGE DATABASE
   ========================================================= */

function mergeProducts(
  existingProducts,
  scrapedProducts,
  discoveredIds
) {
  const scrapedMap =
    buildRawProductMap(
      scrapedProducts
    );

  /*
    نحافظ على ترتيب products.js الحالي.
  */

  const finalProducts =
    [];

  const existingIds =
    new Set();

  let updated = 0;
  let restored = 0;
  let unavailable = 0;
  let unchanged = 0;
  let manual = 0;

  /*
    ---------------------------------------------------------
    المرحلة 1
    المنتجات الموجودة حاليا
    ---------------------------------------------------------
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
      منتج يدوي لا يملك Sawa9ly ID.
      نحافظ عليه كما هو.
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
      -------------------------------------------------------
      المنتج موجود في scraping الحالي
      -------------------------------------------------------
    */

    const scraped =
      scrapedMap.get(id);

    if (scraped) {
      const validation =
        validateScrapedProduct(
          scraped
        );

      if (
        validation.valid
      ) {
        const normalized =
          normalizeScrapedProduct(
            scraped
          );

        const wasUnavailable =
          existing.available === false;

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
    }

    /*
      -------------------------------------------------------
      المنتج لم ينجح scraping.
      
      لا نغيره هنا.

      هذا مهم جدا.

      فشل scraping ≠ المنتج اختفى من Sawa9ly.
    */

    if (
      !discoveredIds.has(id)
    ) {
      /*
        المنتج لم يعد موجودا في discovery.

        لكن لا نعطله مباشرة هنا.

        generator يعتمد على discovery safety
        و missing streak الذي يحسبه discover.js.
      */

      unchanged++;
    } else {
      /*
        موجود في discovery لكن scraping فشل.
      */

      unchanged++;
    }

    finalProducts.push(
      existing
    );
  }


  /*
    ---------------------------------------------------------
    المرحلة 2
    المنتجات الجديدة
    ---------------------------------------------------------
  */

  for (
    const [id, scraped]
    of scrapedMap.entries()
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
  }


  /*
    ---------------------------------------------------------
    المرحلة 3
    المنتجات الموجودة في products.js
    والتي اختفت فعلا من discovery.
    
    لا نحذفها.

    discover.js سيعطي confirmedMissingIds
    بعد عدد من عمليات الفحص.
    ---------------------------------------------------------
  */

  const discoveryReport =
    loadDiscoveryReport();

  const confirmedMissing =
    new Set(
      Array.isArray(
        discoveryReport?.confirmedMissingIds
      )
        ? discoveryReport.confirmedMissingIds.map(
            normalizeId
          )
        : []
    );

  /*
    نعطل فقط المنتجات المؤتمتة
    التي أكد discover.js اختفاءها.
  */

  for (
    let i = 0;
    i < finalProducts.length;
    i++
  ) {
    const product =
      finalProducts[i];

    const id =
      normalizeId(
        product?.sawa9lyId
      );

    if (!id) {
      continue;
    }

    if (
      !confirmedMissing.has(id)
    ) {
      continue;
    }

    /*
      إذا كان المنتج موجودا في scraping الحالي
      فلا يمكن اعتباره مفقودا.
    */

    if (
      scrapedMap.has(id)
    ) {
      continue;
    }

    /*
      المنتجات اليدوية لا نلمسها.
    */

    if (
      isManualProduct(
        product
      )
    ) {
      continue;
    }

    if (
      product.available !== false
    ) {
      finalProducts[i] =
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

      newProducts:
        finalProducts.length -
        existingProducts.length +
        unavailable
    }
  };
}


/* =========================================================
   SANITY CHECK
   ========================================================= */

function validateFinalProducts(
  products,
  existingProducts
) {
  if (
    !Array.isArray(products)
  ) {
    throw new Error(
      "Final products is not an array."
    );
  }

  /*
    لا نسمح بقاعدة منتجات فارغة
    إذا كانت القاعدة القديمة تحتوي
    على منتجات.
  */

  if (
    existingProducts.length > 0 &&
    products.length === 0
  ) {
    throw new Error(
      "Safety stop: generation would create an empty products database."
    );
  }

  /*
    لا يجب أن ينخفض العدد.
    
    منتجات Sawa9ly لا تحذف.
    المنتجات اليدوية أيضا لا تحذف.
  */

  if (
    products.length <
    existingProducts.length
  ) {
    throw new Error(
      `Safety stop: product count decreased from ${existingProducts.length} to ${products.length}.`
    );
  }

  /*
    فحص IDs.
  */

  const ids =
    new Set();

  for (
    const product
    of products
  ) {
    if (
      !product ||
      typeof product !== "object"
    ) {
      throw new Error(
        "Invalid product object detected."
      );
    }

    const id =
      normalizeId(
        product.sawa9lyId
      );

    if (!id) {
      /*
        المنتجات اليدوية يمكن أن تكون
        بدون sawa9lyId.
      */

      continue;
    }

    if (
      ids.has(id)
    ) {
      throw new Error(
        `Duplicate sawa9lyId detected: ${id}`
      );
    }

    ids.add(id);
  }
}


/* =========================================================
   FORMAT products.js
   ========================================================= */

function buildProductsJs(
  products
) {
  /*
    نستخدم JSON صالح داخل JavaScript.

    هذا يجعل الملف:
      - سهل القراءة
      - آمن
      - صالح للاستيراد
      - لا يحتاج eval
  */

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
 * DO NOT EDIT automated Sawa9ly products manually.
 *
 * Last update:
 * ${new Date().toISOString()}
 */

const products = ${json};

export default products;
`;
}


/* =========================================================
   BACKUP BEFORE WRITE
   ========================================================= */

function createLocalBackup() {
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


/* =========================================================
   WRITE ATOMICALLY
   ========================================================= */

function writeProductsAtomic(
  content
) {
  const tempFile =
    `${productsFile}.tmp`;

  fs.writeFileSync(
    tempFile,
    content,
    "utf8"
  );

  /*
    إذا نجح الحفظ، نستبدل الملف.
  */

  fs.renameSync(
    tempFile,
    productsFile
  );
}


/* =========================================================
   FINAL VALIDATION OF GENERATED FILE
   ========================================================= */

async function validateGeneratedFile() {
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

  /*
    فحص syntax بواسطة Function.

    لا يتم تنفيذ المنتجات،
    فقط parse للكود.
  */

  try {
    new Function(
      source.replace(
        /export\s+default\s+products\s*;?\s*$/m,
        ""
      )
    );
  } catch (error) {
    throw new Error(
      `Generated products.js has invalid JavaScript syntax: ${error.message}`
    );
  }

  /*
    نقرأ المصفوفة من المصدر.
  */

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

  return generated;
}


/* =========================================================
   MAIN
   ========================================================= */

async function main() {
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
    ---------------------------------------------------------
    تحميل البيانات
    ---------------------------------------------------------
  */

  const rawProducts =
    loadRawProducts();

  const discoveredIds =
    loadDiscoveredIds();

  const scraperReport =
    loadScraperReport();

  validateScraperSafety(
    rawProducts,
    discoveredIds,
    scraperReport
  );

  /*
    ---------------------------------------------------------
    قراءة products.js الحالي
    ---------------------------------------------------------
  */

  const existingProducts =
    getExistingProducts();

  console.log(
    `📚 Existing products : ${existingProducts.length}`
  );

  console.log(
    `🔎 Discovered        : ${discoveredIds.size}`
  );

  console.log(
    `🕷️ Scraped           : ${rawProducts.length}`
  );

  /*
    ---------------------------------------------------------
    Backup
    ---------------------------------------------------------
  */

  const backupCreated =
    createLocalBackup();

  if (
    backupCreated
  ) {
    console.log(
      `🛡️ Local backup      : ${backupProductsFile}`
    );
  }

  /*
    ---------------------------------------------------------
    Merge
    ---------------------------------------------------------
  */

  const result =
    mergeProducts(
      existingProducts,
      rawProducts,
      discoveredIds
    );

  const finalProducts =
    result.products;

  /*
    ---------------------------------------------------------
    Safety checks
    ---------------------------------------------------------
  */

  validateFinalProducts(
    finalProducts,
    existingProducts
  );

  /*
    ---------------------------------------------------------
    إنشاء products.js
    ---------------------------------------------------------
  */

  const content =
    buildProductsJs(
      finalProducts
    );

  writeProductsAtomic(
    content
  );

  /*
    ---------------------------------------------------------
    فحص الملف بعد الكتابة
    ---------------------------------------------------------
  */

  const generated =
    await validateGeneratedFile();

  /*
    يجب أن يتطابق عدد المنتجات
    ---------------------------------------------------------
  */

  if (
    generated.length !==
    finalProducts.length
  ) {
    throw new Error(
      `Post-write validation failed: expected ${finalProducts.length}, got ${generated.length}.`
    );
  }

  /*
    ---------------------------------------------------------
    Report
    ---------------------------------------------------------
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
      Math.max(
        0,
        finalProducts.length -
          existingProducts.length
      ),

    restored:
      result.stats.restored,

    unavailable:
      result.stats.unavailable,

    unchanged:
      result.stats.unchanged,

    manual:
      result.stats.manual,

    backupCreated,

    safe:
      true,

    productsFile
  };

  writeJson(
    generatorReportFile,
    report
  );

  /*
    ---------------------------------------------------------
    Console
    ---------------------------------------------------------
  */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    " GENERATOR FINISHED"
  );
  console.log(
    "=================================================="
  );

  console.log(
    `📚 Before       : ${existingProducts.length}`
  );

  console.log(
    `🔎 Discovered   : ${discoveredIds.size}`
  );

  console.log(
    `🕷️ Scraped      : ${rawProducts.length}`
  );

  console.log(
    `📦 Final        : ${finalProducts.length}`
  );

  console.log(
    `🔄 Updated      : ${result.stats.updated}`
  );

  console.log(
    `🆕 New          : ${report.newProducts}`
  );

  console.log(
    `♻️ Restored     : ${result.stats.restored}`
  );

  console.log(
    `⛔ Unavailable  : ${result.stats.unavailable}`
  );

  console.log(
    `📌 Unchanged    : ${result.stats.unchanged}`
  );

  console.log(
    `👤 Manual       : ${result.stats.manual}`
  );

  console.log("");

  console.log(
    `📄 ${productsFile}`
  );

  console.log(
    `📄 ${generatorReportFile}`
  );

  console.log("");

  console.log(
    "✅ Product database generated safely."
  );
}


/* =========================================================
   ERROR HANDLER
   ========================================================= */

main().catch(error => {
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

  /*
    نحذف temp إن وجد.
  */

  const tempFile =
    `${productsFile}.tmp`;

  if (
    fs.existsSync(
      tempFile
    )
  ) {
    try {
      fs.unlinkSync(
        tempFile
      );
    } catch {}
  }

  process.exit(1);
});
