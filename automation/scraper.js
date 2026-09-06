import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { config, validateConfig } from "./config.js";

import {
  calculateSellingPrice,
  calculateProfit
} from "./pricing.js";

/* =========================================================
   PRIX CHOC
   SAWA9LY AFFILIATE - FULL PRODUCT SCRAPER
   =========================================================

   الوظائف الأساسية:

   1. قراءة product-links.json الناتج عن discover.js
   2. فحص جميع المنتجات المكتشفة، وليس الجديدة فقط
   3. دعم /store/:id و /product/:id
   4. استخراج:
      - الاسم
      - الوصف
      - سعر المصدر
      - سعر البيع
      - الربح
      - الصورة الرئيسية
      - جميع صور المنتج
      - رابط Sawa9ly
      - ID المنتج
   5. إعادة حساب سعر البيع والربح تلقائيا
   6. الاحتفاظ بالصور المتعددة
   7. تشغيل عدة Workers بالتوازي
   8. عدم الكتابة مباشرة إلى products.js
   9. إنشاء products.raw.json
   10. إنشاء scraper-report.json
   11. إنشاء failed-products.json
   12. حماية النظام من scraping ناقص
   ========================================================= */

validateConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================================================
   PATHS
   ========================================================= */

const outputDir = config?.paths?.outputDir
  ? path.resolve(config.paths.outputDir)
  : path.join(__dirname, "output");

const debugDir = config?.paths?.debugDir
  ? path.resolve(config.paths.debugDir)
  : path.join(__dirname, "debug");

const linksFile = path.join(debugDir, "product-links.json");
const discoveryReportFile = path.join(
  debugDir,
  "discovery-report.json"
);

const outputFile = path.join(
  outputDir,
  "products.raw.json"
);

const scraperReportFile = path.join(
  debugDir,
  "scraper-report.json"
);

const failedProductsFile = path.join(
  debugDir,
  "failed-products.json"
);

const progressFile = path.join(
  debugDir,
  "scraper-progress.json"
);

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(debugDir, { recursive: true });

/* =========================================================
   HELPERS
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonWrite(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;

    return JSON.parse(
      fs.readFileSync(file, "utf8")
    );
  } catch {
    return fallback;
  }
}

function normalizeUrl(value, baseUrl) {
  if (!value) return "";

  try {
    return new URL(
      String(value).trim(),
      baseUrl
    ).href;
  } catch {
    return "";
  }
}

/* =========================================================
   PRODUCT ID
   ========================================================= */

function productIdFromUrl(value) {
  const match = String(value || "").match(
    /\/(?:store|product)\/(\d+)/i
  );

  return match ? match[1] : "";
}

/* =========================================================
   NORMALIZE PRODUCT URL
   ========================================================= */

function normalizeProductUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const id = productIdFromUrl(raw);

  if (!id) return "";

  const base =
    config?.sawa9ly?.baseUrl ||
    "https://affiliate.sawa9ly.pro";

  return `${base.replace(/\/+$/, "")}/store/${id}`;
}

/* =========================================================
   PRICE PARSER
   ========================================================= */

function parsePrice(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  let text = String(value)
    .replace(/\u00a0/g, " ")
    .trim();

  if (!text) return 0;

  /*
    إزالة العملة والنصوص.
  */

  text = text
    .replace(/دج/gi, "")
    .replace(/dzd/gi, "")
    .replace(/\bda\b/gi, "")
    .trim();

  /*
    نبحث عن أول رقم صالح.
  */

  const match = text.match(
    /\d[\d\s.,]*/
  );

  if (!match) return 0;

  let numberText = match[0]
    .replace(/\s+/g, "");

  /*
    أسعار الجزائر غالبا:

    4200
    4 200
    4,200
    4.200
    4 200,00

    لذلك نعالج الفواصل والنقاط
    كفواصل آلاف عندما تكون ضمن رقم.
  */

  if (
    numberText.includes(",") &&
    numberText.includes(".")
  ) {
    numberText = numberText.replace(/[.,]/g, "");
  } else {
    numberText = numberText.replace(/[.,]/g, "");
  }

  const number = Number(numberText);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.round(number);
}

/* =========================================================
   URL / IMAGE FILTER
   ========================================================= */

function isUsableImageUrl(value) {
  if (!value) return false;

  const text = String(value).trim();

  if (!text) return false;

  if (
    text.startsWith("data:") ||
    text.startsWith("blob:")
  ) {
    return false;
  }

  if (
    text.startsWith("javascript:")
  ) {
    return false;
  }

  return true;
}

function looksLikeProductImage(value) {
  const lower = String(value || "").toLowerCase();

  if (!lower) return false;

  const blocked = [
    "favicon",
    "avatar",
    "placeholder",
    "default-avatar",
    "user-avatar",
    "logo-sawa9ly",
    "logo.png",
    "logo.webp",
    "logo.jpg"
  ];

  return !blocked.some(
    item => lower.includes(item)
  );
}

/* =========================================================
   IMAGE EXTRACTION
   ========================================================= */

async function extractImages(page) {
  const rawImages = await page.evaluate(() => {
    const result = [];

    const add = value => {
      if (!value) return;

      const text = String(value).trim();

      if (!text) return;

      if (
        text.startsWith("data:") ||
        text.startsWith("blob:")
      ) {
        return;
      }

      if (!result.includes(text)) {
        result.push(text);
      }
    };

    const addSrcset = value => {
      if (!value) return;

      for (const item of String(value).split(",")) {
        const url = item
          .trim()
          .split(/\s+/)[0];

        add(url);
      }
    };

    const addImageElement = element => {
      if (!element) return;

      const attributes = [
        "src",
        "data-src",
        "data-lazy-src",
        "data-original",
        "data-image",
        "data-image-url",
        "data-full",
        "data-full-image",
        "data-large",
        "data-large-image",
        "data-zoom-image"
      ];

      for (const attribute of attributes) {
        add(
          element.getAttribute(attribute)
        );
      }

      addSrcset(
        element.getAttribute("srcset")
      );

      addSrcset(
        element.getAttribute("data-srcset")
      );
    };

    /*
      Product / gallery images.
    */

    const selectors = [
      "main img",
      "article img",

      '[class*="product"] img',
      '[class*="Product"] img',

      '[class*="gallery"] img',
      '[class*="Gallery"] img',

      '[class*="swiper"] img',
      '[class*="Swiper"] img',

      '[class*="carousel"] img',
      '[class*="Carousel"] img',

      '[class*="slider"] img',
      '[class*="Slider"] img',

      '[class*="thumb"] img',
      '[class*="Thumb"] img',

      '[class*="thumbnail"] img',
      '[class*="Thumbnail"] img',

      '[data-thumbnail] img',

      '[data-gallery] img',
      '[data-product-image] img',

      'picture img'
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        addImageElement(element);
      }
    }

    /*
      Picture sources.
    */

    for (const source of document.querySelectorAll("source")) {
      addSrcset(
        source.getAttribute("srcset")
      );

      add(
        source.getAttribute("src")
      );
    }

    /*
      Links directly pointing to images.
    */

    for (const link of document.querySelectorAll("a[href]")) {
      const href =
        link.getAttribute("href") || "";

      if (
        /\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i.test(
          href
        )
      ) {
        add(href);
      }
    }

    /*
      OpenGraph / Twitter.
    */

    for (const selector of [
      'meta[property="og:image"]',
      'meta[property="og:image:url"]',
      'meta[property="og:image:secure_url"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]'
    ]) {
      const meta =
        document.querySelector(selector);

      add(meta?.content);
    }

    /*
      JSON-LD.
    */

    for (const script of document.querySelectorAll(
      'script[type="application/ld+json"]'
    )) {
      try {
        const data = JSON.parse(
          script.textContent || ""
        );

        const objects = Array.isArray(data)
          ? data
          : [data];

        for (const object of objects) {
          if (!object) continue;

          const image = object.image;

          if (typeof image === "string") {
            add(image);
          }

          if (Array.isArray(image)) {
            for (const item of image) {
              if (typeof item === "string") {
                add(item);
              } else {
                add(item?.url);
                add(item?.contentUrl);
              }
            }
          }

          if (
            image &&
            typeof image === "object" &&
            !Array.isArray(image)
          ) {
            add(image.url);
            add(image.contentUrl);
          }

          /*
            بعض المواقع تستخدم product.images
          */

          if (Array.isArray(object.images)) {
            for (const item of object.images) {
              if (typeof item === "string") {
                add(item);
              } else {
                add(item?.url);
                add(item?.contentUrl);
              }
            }
          }
        }
      } catch {
        // تجاهل JSON-LD غير صالح
      }
    }

    /*
      أخيرا: إذا لم نجد صورا من selectors
      نحاول جميع img.
    */

    if (result.length === 0) {
      for (const image of document.querySelectorAll("img")) {
        addImageElement(image);
      }
    }

    return result;
  });

  const images = [];

  for (const image of rawImages) {
    if (!isUsableImageUrl(image)) continue;

    if (!looksLikeProductImage(image)) continue;

    const normalized = normalizeUrl(
      image,
      page.url()
    );

    if (!normalized) continue;

    if (!images.includes(normalized)) {
      images.push(normalized);
    }
  }

  /*
    الحد الأعلى حتى لا نحفظ عشرات الصور
    غير المتعلقة بالمنتج من الصفحة.
  */

  const limitedImages = images.slice(0, 20);

  return {
    image: limitedImages[0] || "",
    images: limitedImages
  };
}

/* =========================================================
   NAME EXTRACTION
   ========================================================= */

async function extractName(page) {
  const result = await page.evaluate(() => {
    const clean = value =>
      String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const invalid = value => {
      const text = clean(value);

      if (!text) return true;

      if (text.length < 3) return true;

      if (text.length > 300) return true;

      const lower = text.toLowerCase();

      const rejected = [
        "login",
        "register",
        "sign in",
        "sign up",
        "add to cart",
        "buy now",
        "commander maintenant",
        "ajouter au panier",
        "description",
        "الوصف",
        "تسجيل الدخول",
        "إنشاء حساب"
      ];

      return rejected.includes(lower);
    };

    /*
      JSON-LD Product name
    */

    for (const script of document.querySelectorAll(
      'script[type="application/ld+json"]'
    )) {
      try {
        const data = JSON.parse(
          script.textContent || ""
        );

        const objects = Array.isArray(data)
          ? data
          : [data];

        for (const object of objects) {
          if (
            object?.name &&
            !invalid(object.name)
          ) {
            return clean(object.name);
          }
        }
      } catch {}
    }

    const directCandidates = [
      document.querySelector("h1")?.innerText,

      document.querySelector(
        '[data-product-title]'
      )?.innerText,

      document.querySelector(
        '[data-product-name]'
      )?.innerText,

      document.querySelector(
        'meta[property="og:title"]'
      )?.content,

      document.querySelector(
        'meta[name="twitter:title"]'
      )?.content,

      document.querySelector("title")?.innerText
    ];

    for (const candidate of directCandidates) {
      if (!invalid(candidate)) {
        return clean(candidate);
      }
    }

    const selectors = [
      '[class*="product-title"]',
      '[class*="Product-title"]',
      '[class*="product_name"]',
      '[class*="product-name"]',
      '[class*="Product-name"]',
      '[class*="productName"]',
      '[class*="title"]'
    ];

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(
        selector
      )) {
        const text = clean(
          element.innerText
        );

        if (!invalid(text)) {
          return text;
        }
      }
    }

    return "";
  });

  return cleanText(result);
}

/* =========================================================
   DESCRIPTION EXTRACTION
   ========================================================= */

async function extractDescription(
  page,
  productName
) {
  const result = await page.evaluate(
    name => {
      const clean = value =>
        String(value || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const productNameLower =
        clean(name).toLowerCase();

      const candidates = [];

      /*
        JSON-LD
      */

      for (const script of document.querySelectorAll(
        'script[type="application/ld+json"]'
      )) {
        try {
          const data = JSON.parse(
            script.textContent || ""
          );

          const objects = Array.isArray(data)
            ? data
            : [data];

          for (const object of objects) {
            if (object?.description) {
              candidates.push(
                object.description
              );
            }
          }
        } catch {}
      }

      /*
        Meta
      */

      candidates.push(
        document.querySelector(
          'meta[name="description"]'
        )?.content
      );

      candidates.push(
        document.querySelector(
          'meta[property="og:description"]'
        )?.content
      );

      for (const candidate of candidates) {
        const value = clean(candidate);

        if (!value) continue;

        if (value.length < 20) continue;

        if (value.length > 10000) continue;

        if (
          productNameLower &&
          value.toLowerCase() === productNameLower
        ) {
          continue;
        }

        return value;
      }

      const selectors = [
        '[class*="product-description"]',
        '[class*="Product-description"]',
        '[class*="productDescription"]',
        '[class*="description"]',
        '[class*="Description"]',
        '[class*="details"]',
        '[class*="Details"]',
        '[data-description]'
      ];

      for (const selector of selectors) {
        for (const element of document.querySelectorAll(
          selector
        )) {
          const value = clean(
            element.innerText
          );

          if (
            value.length >= 20 &&
            value.length <= 10000
          ) {
            return value;
          }
        }
      }

      return "";
    },
    productName
  );

  return cleanText(result);
}

/* =========================================================
   PRICE EXTRACTION
   ========================================================= */

async function extractBasePrice(page) {
  const candidates = await page.evaluate(() => {
    const result = [];

    const add = value => {
      if (
        value !== null &&
        value !== undefined &&
        String(value).trim()
      ) {
        result.push(String(value));
      }
    };

    /*
      JSON-LD أولاً.
    */

    for (const script of document.querySelectorAll(
      'script[type="application/ld+json"]'
    )) {
      try {
        const data = JSON.parse(
          script.textContent || ""
        );

        const objects = Array.isArray(data)
          ? data
          : [data];

        for (const object of objects) {
          if (object?.offers) {
            const offers = Array.isArray(
              object.offers
            )
              ? object.offers
              : [object.offers];

            for (const offer of offers) {
              add(offer?.price);
              add(offer?.lowPrice);
            }
          }

          add(object?.price);
        }
      } catch {}
    }

    /*
      Meta product price.
    */

    for (const selector of [
      'meta[property="product:price:amount"]',
      'meta[itemprop="price"]'
    ]) {
      add(
        document.querySelector(
          selector
        )?.content
      );
    }

    /*
      Data attributes.
    */

    for (const element of document.querySelectorAll(
      "[data-price], [data-product-price]"
    )) {
      add(
        element.getAttribute("data-price")
      );

      add(
        element.getAttribute(
          "data-product-price"
        )
      );
    }

    /*
      Price elements.
    */

    for (const element of document.querySelectorAll(
      [
        '[class*="product-price"]',
        '[class*="Product-price"]',
        '[class*="productPrice"]',
        '[class*="price"]',
        '[class*="Price"]',
        '[class*="montant"]',
        '[class*="Montant"]'
      ].join(",")
    )) {
      add(element.innerText);
    }

    /*
      Body text أخيرا.
    */

    add(
      document.body?.innerText || ""
    );

    return result;
  });

  /*
    الأفضلية:

    1. رقم بجانب DA / DZD / دج
    2. price / prix / السعر
    3. candidate رقمي مباشر
  */

  for (const candidate of candidates) {
    const text = String(candidate || "");

    const patterns = [
      /(\d[\d\s.,]{1,})\s*(?:دج|DA|DZD)\b/i,

      /(?:السعر|prix|price|montant)\s*[:：]?\s*(\d[\d\s.,]*)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);

      if (!match) continue;

      const price = parsePrice(match[1]);

      if (
        price > 0 &&
        price < 100000000
      ) {
        return price;
      }
    }
  }

  /*
    Candidate رقمي مباشر.
  */

  for (const candidate of candidates) {
    const text = String(candidate || "").trim();

    if (!/^\d[\d\s.,]*$/.test(text)) {
      continue;
    }

    const price = parsePrice(text);

    if (
      price > 0 &&
      price < 100000000
    ) {
      return price;
    }
  }

  return 0;
}

/* =========================================================
   CANONICAL / SAWA9LY LINK
   ========================================================= */

async function extractCanonical(
  page,
  fallbackUrl
) {
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute("href")
    .catch(() => null);

  const canonicalUrl =
    normalizeUrl(
      canonical,
      page.url()
    );

  const id =
    productIdFromUrl(canonicalUrl) ||
    productIdFromUrl(page.url()) ||
    productIdFromUrl(fallbackUrl);

  if (!id) {
    return normalizeProductUrl(
      fallbackUrl
    );
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
   PAGE LOADING
   ========================================================= */

async function prepareProductPage(page) {
  await page.waitForLoadState(
    "domcontentloaded",
    { timeout: 30000 }
  ).catch(() => {});

  /*
    React / Next / SPA
    يحتاج وقتا حتى تظهر البيانات.
  */

  await page.waitForTimeout(1000);

  /*
    محاولة انتظار h1 أو body.
  */

  await Promise.race([
    page
      .waitForSelector("h1", {
        timeout: 8000
      })
      .catch(() => {}),

    page
      .waitForSelector(
        '[class*="product"]',
        {
          timeout: 8000
        }
      )
      .catch(() => {}),

    page
      .waitForSelector(
        '[class*="price"]',
        {
          timeout: 8000
        }
      )
      .catch(() => {})
  ]);

  /*
    وقت إضافي بسيط للصور والـAPI.
  */

  await page.waitForTimeout(800);
}

/* =========================================================
   LOGIN DETECTION
   ========================================================= */

async function isLoginPage(page) {
  const url = page.url();

  if (/\/login\b/i.test(url)) {
    return true;
  }

  const body = cleanText(
    await page.locator("body").innerText()
      .catch(() => "")
  );

  const lower = body.toLowerCase();

  const loginIndicators = [
    "تسجيل الدخول",
    "connexion",
    "se connecter",
    "login",
    "sign in"
  ];

  return loginIndicators.some(
    indicator =>
      lower.includes(
        indicator.toLowerCase()
      )
  );
}

/* =========================================================
   LOGIN
   ========================================================= */

async function login(page) {
  const loginUrl =
    config?.sawa9ly?.loginUrl ||
    "https://affiliate.sawa9ly.pro/login";

  console.log(
    `🔐 Opening Sawa9ly login: ${loginUrl}`
  );

  await page.goto(loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(1200);

  /*
    إذا كانت الجلسة أصلا صالحة.
  */

  if (!(await isLoginPage(page))) {
    console.log(
      "✅ Existing authenticated session detected."
    );

    return true;
  }

  const email =
    config?.sawa9ly?.email || "";

  const password =
    config?.sawa9ly?.password || "";

  if (!email || !password) {
    throw new Error(
      "SAWA9LY_EMAIL / SAWA9LY_PASSWORD are missing."
    );
  }

  /*
    Email selectors.
  */

  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[autocomplete="email"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="e-mail" i]'
  ];

  let emailInput = null;

  for (const selector of emailSelectors) {
    const locator = page.locator(selector).first();

    if (
      await locator.count().catch(() => 0)
    ) {
      emailInput = locator;
      break;
    }
  }

  if (!emailInput) {
    throw new Error(
      "Could not find Sawa9ly email input."
    );
  }

  await emailInput.fill(email);

  /*
    Password.
  */

  const passwordInput =
    page.locator(
      'input[type="password"]'
    ).first();

  if (
    !(await passwordInput.count())
  ) {
    throw new Error(
      "Could not find Sawa9ly password input."
    );
  }

  await passwordInput.fill(password);

  /*
    Submit.
  */

  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Connexion")',
    'button:has-text("Se connecter")',
    'button:has-text("Login")',
    'button:has-text("Sign in")',
    'button:has-text("تسجيل الدخول")'
  ];

  let submitted = false;

  for (const selector of submitSelectors) {
    const button =
      page.locator(selector).first();

    if (
      await button.count().catch(() => 0)
    ) {
      await button.click().catch(() => {});
      submitted = true;
      break;
    }
  }

  if (!submitted) {
    await passwordInput.press("Enter");
  }

  /*
    انتظر redirect.
  */

  await page.waitForTimeout(2500);

  await page.waitForLoadState(
    "domcontentloaded",
    { timeout: 15000 }
  ).catch(() => {});

  /*
    فحص الجلسة.
  */

  if (await isLoginPage(page)) {
    throw new Error(
      "Sawa9ly login failed or session was not established."
    );
  }

  console.log(
    `✅ Sawa9ly authenticated: ${page.url()}`
  );

  return true;
}

/* =========================================================
   PRODUCT EXTRACTION
   ========================================================= */

async function extractProduct(
  page,
  originalUrl
) {
  const normalizedUrl =
    normalizeProductUrl(originalUrl);

  if (!normalizedUrl) {
    throw new Error(
      `Invalid product URL: ${originalUrl}`
    );
  }

  const requestedId =
    productIdFromUrl(normalizedUrl);

  if (!requestedId) {
    throw new Error(
      `Could not extract product ID from ${normalizedUrl}`
    );
  }

  await page.goto(normalizedUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await prepareProductPage(page);

  /*
    إذا أعاد الموقع إلى login
    فالجلسة انتهت.
  */

  if (await isLoginPage(page)) {
    throw new Error(
      "Sawa9ly session expired while scraping."
    );
  }

  const bodyText = cleanText(
    await page.locator("body").innerText()
      .catch(() => "")
  );

  if (
    /page not found|not found|404|product not found/i.test(
      bodyText
    )
  ) {
    throw new Error(
      "Sawa9ly product page returned Not Found."
    );
  }

  const finalId =
    productIdFromUrl(page.url()) ||
    requestedId;

  if (!finalId) {
    throw new Error(
      "Could not determine final Sawa9ly product ID."
    );
  }

  /*
    استخراج البيانات.
  */

  const name =
    await extractName(page);

  if (!name) {
    throw new Error(
      `Product ${finalId}: name not found.`
    );
  }

  const description =
    await extractDescription(
      page,
      name
    );

  const basePrice =
    await extractBasePrice(page);

  if (!basePrice || basePrice <= 0) {
    throw new Error(
      `Product ${finalId}: valid source price not found.`
    );
  }

  const imageData =
    await extractImages(page);

  if (
    !imageData.image ||
    !imageData.images.length
  ) {
    throw new Error(
      `Product ${finalId}: product image not found.`
    );
  }

  /*
    حساب السعر من السعر الأصلي.
  */

  const sellingPrice =
    calculateSellingPrice(
      basePrice
    );

  const profit =
    calculateProfit(
      basePrice,
      sellingPrice
    );

  const sawa9lyLink =
    await extractCanonical(
      page,
      normalizedUrl
    );

  return {
    sawa9lyId: String(finalId),

    name: cleanText(name),

    description:
      cleanText(description),

    basePrice: Number(basePrice),

    sellingPrice:
      Number(sellingPrice),

    profit:
      Number(profit),

    image:
      imageData.image,

    images:
      imageData.images,

    sawa9lyLink:
      sawa9lyLink ||
      normalizedUrl,

    available: true,

    automated: true,

    scrapedAt:
      new Date().toISOString()
  };
}

/* =========================================================
   LOAD DISCOVERED LINKS
   ========================================================= */

function loadProductLinks() {
  if (!fs.existsSync(linksFile)) {
    throw new Error(
      `product-links.json not found: ${linksFile}`
    );
  }

  const raw =
    readJson(linksFile, null);

  if (!Array.isArray(raw)) {
    throw new Error(
      "product-links.json must contain an array."
    );
  }

  const map = new Map();

  for (const item of raw) {
    const href =
      typeof item === "string"
        ? item
        : item?.href;

    const normalized =
      normalizeProductUrl(href);

    if (!normalized) continue;

    const id =
      productIdFromUrl(normalized);

    if (!id) continue;

    if (!map.has(id)) {
      map.set(id, {
        sawa9lyId: id,
        href: normalized
      });
    }
  }

  return [...map.values()];
}

/* =========================================================
   DISCOVERY SAFETY
   ========================================================= */

function validateDiscoverySafety(
  productLinks
) {
  if (!fs.existsSync(discoveryReportFile)) {
    console.warn(
      "⚠️ discovery-report.json غير موجود."
    );

    /*
      لا نوقف scraper بسبب اختلاف بسيط
      في نسخة discover القديمة.
    */

    return;
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

  if (report.complete === false) {
    throw new Error(
      "Discovery is incomplete. Scraping stopped for safety."
    );
  }

  if (
    report.availabilitySafe === false
  ) {
    throw new Error(
      "Discovery is not availability-safe. Scraping stopped."
    );
  }

  if (
    Number(report.discovered || 0) > 0 &&
    productLinks.length === 0
  ) {
    throw new Error(
      "Discovery reports products but scraper found zero valid product links."
    );
  }
}

/* =========================================================
   SAVE PROGRESS
   ========================================================= */

function saveProgress(
  total,
  completed,
  successful,
  failed
) {
  safeJsonWrite(
    progressFile,
    {
      updatedAt:
        new Date().toISOString(),

      total,

      completed,

      successful,

      failed,

      coverage:
        total > 0
          ? Number(
              (
                successful / total
              ).toFixed(4)
            )
          : 0
    }
  );
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
    " PRIX CHOC - SAWA9LY FULL PRODUCT SCRAPER"
  );
  console.log(
    "=================================================="
  );
  console.log("");

  const productLinks =
    loadProductLinks();

  validateDiscoverySafety(
    productLinks
  );

  if (!productLinks.length) {
    throw new Error(
      "No valid Sawa9ly products discovered."
    );
  }

  /*
    مهم جدا:

    لا نستخدم existing products هنا.

    كل المنتجات المكتشفة ستدخل scraping
    في كل تشغيل حتى تتحدث الأسعار والصور.
  */

  const scrapeLimit = Math.max(
    1,
    Number(
      config?.automation?.scrapeLimit ||
      productLinks.length
    )
  );

  /*
    إذا كان limit أكبر من عدد المنتجات:
    نستخدم جميع المنتجات.

    وإذا كان أقل:
    نحترم limit.
  */

  const selectedLinks =
    productLinks.slice(
      0,
      Math.min(
        scrapeLimit,
        productLinks.length
      )
    );

  const concurrency = Math.max(
    1,
    Math.min(
      Number(
        config?.automation?.scrapeConcurrency ||
        4
      ),
      selectedLinks.length
    )
  );

  console.log(
    `📦 Discovered products : ${productLinks.length}`
  );

  console.log(
    `🔎 Products to scrape  : ${selectedLinks.length}`
  );

  console.log(
    `⚙️ Concurrency          : ${concurrency}`
  );

  console.log(
    `🌐 Sawa9ly              : ${
      config?.sawa9ly?.dashboardUrl ||
      "https://affiliate.sawa9ly.pro/store"
    }`
  );

  console.log("");

  /* =======================================================
     BROWSER
     ======================================================= */

  const browser =
    await chromium.launch({
      headless:
        config?.automation?.headless !== false,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

  const context =
    await browser.newContext({
      viewport: {
        width: 1440,
        height: 900
      },

      locale: "fr-DZ",

      timezoneId:
        "Africa/Algiers",

      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    });

  /*
    منع بعض الموارد غير الضرورية
    لتسريع scraping.

    لا نحجب الصور لأنها ضرورية
    لاستخراج الصور.
  */

  await context.route(
    "**/*",
    async route => {
      const request =
        route.request();

      const type =
        request.resourceType();

      if (
        type === "font" ||
        type === "media"
      ) {
        await route.abort()
          .catch(() => {});
        return;
      }

      await route.continue()
        .catch(() => {});
    }
  );

  /* =======================================================
     LOGIN
     ======================================================= */

  const loginPage =
    await context.newPage();

  try {
    await login(loginPage);
  } finally {
    await loginPage.close()
      .catch(() => {});
  }

  /* =======================================================
     WORKERS
     ======================================================= */

  const pages = [];

  for (
    let i = 0;
    i < concurrency;
    i++
  ) {
    pages.push(
      await context.newPage()
    );
  }

  const products = [];
  const failed = [];

  let nextIndex = 0;
  let completed = 0;

  /*
    Mutex بسيط للـprogress console.

    JS event loop يمنع race حقيقي
    على nextIndex هنا.
  */

  async function worker(
    page,
    workerNumber
  ) {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >= selectedLinks.length
      ) {
        break;
      }

      const item =
        selectedLinks[index];

      const position =
        index + 1;

      try {
        /*
          إعادة محاولة واحدة إذا حدث timeout
          أو network error.
        */

        let product = null;
        let lastError = null;

        for (
          let attempt = 1;
          attempt <= 2;
          attempt++
        ) {
          try {
            product =
              await extractProduct(
                page,
                item.href
              );

            break;
          } catch (error) {
            lastError = error;

            if (attempt === 1) {
              await sleep(700);
            }
          }
        }

        if (!product) {
          throw (
            lastError ||
            new Error(
              "Unknown scraping error."
            )
          );
        }

        products.push(product);

        completed++;

        console.log(
          `✅ ${position}/${selectedLinks.length} | ` +
          `${product.sawa9lyId} | ` +
          `${product.basePrice} DA | ` +
          `${product.images.length} images`
        );

        saveProgress(
          selectedLinks.length,
          completed,
          products.length,
          failed.length
        );
      } catch (error) {
        completed++;

        const failedItem = {
          position,

          sawa9lyId:
            item.sawa9lyId,

          href:
            item.href,

          error:
            error?.message ||
            String(error),

          failedAt:
            new Date().toISOString()
        };

        failed.push(
          failedItem
        );

        console.error(
          `❌ ${position}/${selectedLinks.length} | ` +
          `${item.sawa9lyId} | ` +
          `${failedItem.error}`
        );

        /*
          لا نضع المنتج الفاشل داخل products.raw.json.

          هذا مهم جدا:
          generator.js لاحقا لن يستبدل
          بيانات المنتج القديمة ببيانات ناقصة.
        */

        saveProgress(
          selectedLinks.length,
          completed,
          products.length,
          failed.length
        );
      }
    }
  }

  await Promise.all(
    pages.map(
      (page, index) =>
        worker(
          page,
          index + 1
        )
    )
  );

  /* =======================================================
     CLOSE PAGES
     ======================================================= */

  for (const page of pages) {
    await page.close()
      .catch(() => {});
  }

  await context.close()
    .catch(() => {});

  await browser.close()
    .catch(() => {});

  /* =======================================================
     SORT PRODUCTS
     ======================================================= */

  products.sort(
    (a, b) =>
      Number(a.sawa9lyId) -
      Number(b.sawa9lyId)
  );

  failed.sort(
    (a, b) =>
      Number(a.position) -
      Number(b.position)
  );

  /* =======================================================
     COVERAGE
     ======================================================= */

  const total =
    selectedLinks.length;

  const successful =
    products.length;

  const failedCount =
    failed.length;

  const coverage =
    total > 0
      ? Number(
          (
            successful / total
          ).toFixed(4)
        )
      : 0;

  /*
    حماية قوية:

    إذا فشل أكثر من 30% من المنتجات
    لا نسمح للمرحلة التالية بالنشر.

    السبب:
    قد يكون Sawa9ly غير متاح
    أو انتهت الجلسة
    أو تغير تصميم الموقع.
  */

  const minimumSafeCoverage =
    0.70;

  const coverageSafe =
    coverage >=
    minimumSafeCoverage;

  /* =======================================================
     WRITE PRODUCTS RAW
     ======================================================= */

  safeJsonWrite(
    outputFile,
    products
  );

  /* =======================================================
     WRITE FAILED PRODUCTS
     ======================================================= */

  safeJsonWrite(
    failedProductsFile,
    failed
  );

  /* =======================================================
     REPORT
     ======================================================= */

  const report = {
    generatedAt:
      new Date().toISOString(),

    discovered:
      productLinks.length,

    selected:
      selectedLinks.length,

    scraped:
      successful,

    failed:
      failedCount,

    coverage,

    minimumSafeCoverage,

    coverageSafe,

    /*
      true فقط إذا كانت كل المنتجات
      المطلوبة نجحت.
    */

    complete:
      failedCount === 0,

    /*
      يسمح للـgenerator بمعرفة
      هل يمكن الاعتماد على هذه البيانات.
    */

    safeToPublish:
      coverageSafe &&
      successful > 0,

    outputFile,

    failedProductsFile
  };

  safeJsonWrite(
    scraperReportFile,
    report
  );

  /* =======================================================
     FINAL OUTPUT
     ======================================================= */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    " SCRAPER FINISHED"
  );
  console.log(
    "=================================================="
  );

  console.log(
    `📦 Discovered : ${productLinks.length}`
  );

  console.log(
    `🔎 Selected   : ${selectedLinks.length}`
  );

  console.log(
    `✅ Scraped    : ${successful}`
  );

  console.log(
    `❌ Failed     : ${failedCount}`
  );

  console.log(
    `📊 Coverage   : ${(coverage * 100).toFixed(2)}%`
  );

  console.log(
    `🛡️ Safe       : ${coverageSafe ? "YES" : "NO"}`
  );

  console.log("");

  console.log(
    `📄 ${outputFile}`
  );

  console.log(
    `📄 ${scraperReportFile}`
  );

  console.log(
    `📄 ${failedProductsFile}`
  );

  console.log("");

  /*
    إذا كانت التغطية أقل من 70%
    نفشل الـworkflow.

    هذا يمنع generator من نشر
    تحديث ناقص قد يؤدي إلى إفساد
    قاعدة المنتجات.
  */

  if (!coverageSafe) {
    throw new Error(
      `Scraping coverage too low: ${(coverage * 100).toFixed(
        2
      )}%. Minimum required: 70%.`
    );
  }

  /*
    في الوضع الكامل، لا نريد نجاحا
    صامتا مع وجود منتجات فاشلة.

    لكن لا نعتبر فشل منتج واحد
    سببا في إسقاط كامل العملية
    طالما التغطية آمنة.

    generator.js سيحافظ على
    بيانات المنتجات الفاشلة القديمة.
  */

  console.log(
    "✅ Scraper completed safely."
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
    " SCRAPER ERROR"
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
});
