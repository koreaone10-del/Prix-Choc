import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  config,
  validateConfig,
} from "./config.js";

import {
  calculateSellingPrice,
  calculateProfit,
} from "./pricing.js";

/*
=========================================================
 PRIX-CHOC
 SAWA9LY FULL PRODUCT SCRAPER
=========================================================

المهام:

1. قراءة product-links.json.
2. التأكد من أن Discovery ناجح وآمن.
3. فحص جميع المنتجات المكتشفة.
4. تحديث:
   - الاسم
   - الوصف
   - السعر الأصلي
   - سعر البيع
   - الربح
   - الصورة الرئيسية
   - جميع الصور
   - رابط Sawa9ly
5. إعادة محاولة المنتج الفاشل.
6. الاحتفاظ بالمنتجات التي فشل scraping لها
   خارج products.raw.json.
7. إنشاء scraper-report.json.
8. منع نشر نتيجة ناقصة.

مهم:

هذا الملف لا يكتب products.js.
generator.js هو المسؤول عن ذلك.
=========================================================
*/

validateConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const linksFile = path.join(
  debugDir,
  "product-links.json"
);

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

fs.mkdirSync(outputDir, {
  recursive: true,
});

fs.mkdirSync(debugDir, {
  recursive: true,
});

/*
=========================================================
 SETTINGS
=========================================================
*/

const SCRAPE_LIMIT = Math.max(
  1,
  Number(
    config.automation.scrapeLimit
  )
);

const CONCURRENCY = Math.max(
  1,
  Number(
    config.automation.concurrency
  )
);

const NAVIGATION_TIMEOUT = Math.max(
  10000,
  Number(
    config.automation.navigationTimeoutMs
  )
);

const PAGE_TIMEOUT = Math.max(
  10000,
  Number(
    config.automation.pageTimeoutMs
  )
);

const RENDER_WAIT = Math.max(
  0,
  Number(
    config.automation.renderWaitMs
  )
);

const MINIMUM_COVERAGE =
  Math.max(
    0.01,
    Math.min(
      1,
      Number(
        config.automation
          .minimumCoveragePercent
      ) / 100
    )
  );

/*
=========================================================
 HELPERS
=========================================================
*/

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
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

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
  } catch {
    return fallback;
  }
}

function writeJson(
  file,
  data
) {
  fs.mkdirSync(
    path.dirname(file),
    {
      recursive: true,
    }
  );

  const temporaryFile =
    `${file}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(
      data,
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

function normalizeUrl(
  value,
  baseUrl
) {
  if (!value) {
    return "";
  }

  try {
    return new URL(
      String(value).trim(),
      baseUrl
    ).href;
  } catch {
    return "";
  }
}

/*
=========================================================
 PRODUCT ID
=========================================================
*/

function productIdFromUrl(
  value
) {
  const match =
    String(value || "").match(
      /\/(?:store|product)\/(\d+)/i
    );

  return match
    ? String(match[1])
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
 PRICE
=========================================================
*/

function parsePrice(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  let text =
    String(value)
      .replace(
        /\u00a0/g,
        " "
      )
      .trim();

  if (!text) {
    return 0;
  }

  text = text
    .replace(/دج/gi, "")
    .replace(/dzd/gi, "")
    .replace(/\bda\b/gi, "")
    .trim();

  const match =
    text.match(
      /\d[\d\s.,]*/
    );

  if (!match) {
    return 0;
  }

  const numberText =
    match[0].replace(
      /[\s.,]/g,
      ""
    );

  const number =
    Number(numberText);

  if (
    !Number.isFinite(number)
  ) {
    return 0;
  }

  return Math.round(number);
}

/*
=========================================================
 IMAGE HELPERS
=========================================================
*/

function isUsableImageUrl(
  value
) {
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
    text.startsWith("blob:") ||
    text.startsWith(
      "javascript:"
    )
  ) {
    return false;
  }

  return true;
}

function looksLikeProductImage(
  value
) {
  const lower =
    String(value || "")
      .toLowerCase();

  if (!lower) {
    return false;
  }

  const blocked = [
    "favicon",
    "avatar",
    "placeholder",
    "default-avatar",
    "user-avatar",
    "logo-sawa9ly",
    "logo.png",
    "logo.webp",
    "logo.jpg",
    "icon-facebook",
    "icon-instagram",
    "icon-youtube",
  ];

  return !blocked.some(
    (item) =>
      lower.includes(item)
  );
}

/*
=========================================================
 EXTRACT ALL IMAGES
=========================================================
*/

async function extractImages(page) {
  const rawCandidates = await page.evaluate(() => {
    const result = [];

    const add = (value, score = 0, width = 0, height = 0, source = "") => {
      if (!value) return;
      const text = String(value).trim();
      if (!text || text.startsWith("data:") || text.startsWith("blob:")) return;
      result.push({ url: text, score, width: Number(width) || 0, height: Number(height) || 0, source });
    };

    const parseSrcset = (value, baseScore, source) => {
      if (!value) return;
      for (const part of String(value).split(",")) {
        const bits = part.trim().split(/\s+/);
        const url = bits[0];
        if (!url) continue;
        let width = 0;
        let density = 0;
        const descriptor = bits[1] || "";
        if (/^\d+w$/i.test(descriptor)) width = parseInt(descriptor, 10) || 0;
        if (/^\d+(?:\.\d+)?x$/i.test(descriptor)) density = parseFloat(descriptor) || 0;
        add(url, baseScore + Math.min(width / 100, 25) + density * 4, width, 0, source);
      }
    };

    const addImage = (el) => {
      if (!el) return;
      const attrs = [
        ["data-zoom-image", 100], ["data-full-image", 98], ["data-full", 96],
        ["data-large-image", 94], ["data-large", 92], ["data-original", 90],
        ["data-image-url", 88], ["data-image", 86], ["data-src", 82],
        ["data-lazy-src", 80], ["src", 70]
      ];
      for (const [attr, score] of attrs) {
        const v = el.getAttribute(attr);
        if (v) add(v, score, el.naturalWidth, el.naturalHeight, attr);
      }
      parseSrcset(el.getAttribute("srcset"), 78, "srcset");
      parseSrcset(el.getAttribute("data-srcset"), 84, "data-srcset");
      const src = el.currentSrc || el.src || "";
      if (src) add(src, 76, el.naturalWidth, el.naturalHeight, "currentSrc");
    };

    const selectors = [
      "main img", "article img", '[class*="product"] img', '[class*="Product"] img',
      '[class*="gallery"] img', '[class*="Gallery"] img', '[class*="swiper"] img',
      '[class*="Swiper"] img', '[class*="carousel"] img', '[class*="Carousel"] img',
      '[class*="slider"] img', '[class*="Slider"] img', '[class*="thumb"] img',
      '[class*="Thumb"] img', '[class*="thumbnail"] img', '[class*="Thumbnail"] img',
      "[data-thumbnail] img", "[data-gallery] img", "[data-product-image] img", "picture img"
    ];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) addImage(el);
    }

    for (const source of document.querySelectorAll("source")) {
      parseSrcset(source.getAttribute("srcset"), 72, "source-srcset");
      add(source.getAttribute("src"), 68, 0, 0, "source");
    }

    for (const link of document.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href") || "";
      if (/\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i.test(href)) add(href, 65, 0, 0, "link");
    }

    for (const selector of [
      'meta[property="og:image"]', 'meta[property="og:image:url"]',
      'meta[property="og:image:secure_url"]', 'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]'
    ]) {
      const meta = document.querySelector(selector);
      if (meta?.content) add(meta.content, 60, 0, 0, "meta");
    }

    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent || "");
        const objects = Array.isArray(data) ? data : [data];
        const addObj = (image) => {
          if (typeof image === "string") add(image, 74, 0, 0, "jsonld");
          else if (image && typeof image === "object") {
            add(image.url, 74, 0, 0, "jsonld");
            add(image.contentUrl, 74, 0, 0, "jsonld");
          }
        };
        for (const obj of objects) {
          if (!obj) continue;
          if (Array.isArray(obj.image)) obj.image.forEach(addObj); else addObj(obj.image);
          if (Array.isArray(obj.images)) obj.images.forEach(addObj);
        }
      } catch (_) {}
    }

    return result;
  });

  const bestBySource = new Map();
  const sourceKey = (url) => {
    try {
      const u = new URL(url, page.url());
      // Next/Image URLs wrap the real source in ?url=. Deduplicate all sizes
      // of the same original image so 3840/1920/640 variants are not treated
      // as separate gallery pictures.
      const wrapped = u.searchParams.get("url");
      if (wrapped) return wrapped;
      u.searchParams.delete("w");
      u.searchParams.delete("q");
      return u.toString();
    } catch (_) {
      return String(url).replace(/[?&](?:w|q)=\d+/g, "");
    }
  };

  for (const item of rawCandidates) {
    if (!isUsableImageUrl(item.url)) continue;
    const key = sourceKey(item.url);
    const score = Number(item.score || 0) + Math.min(Number(item.width || 0) / 100, 30);
    const candidate = { ...item, score, key };
    const previous = bestBySource.get(key);
    if (!previous || candidate.score > previous.score || (candidate.width || 0) > (previous.width || 0)) {
      bestBySource.set(key, candidate);
    }
  }

  const ranked = [...bestBySource.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.width * b.height) - (a.width * a.height);
  });

  const images = ranked.map(x => x.url).slice(0, 20);
  return { image: images[0] || "", images };
}

async function extractBasePrice(
  page
) {
  const candidates =
    await page.evaluate(() => {
      const values = [];

      const add = (
        value
      ) => {
        if (
          value !== null &&
          value !== undefined &&
          String(value).trim()
        ) {
          values.push(
            String(value)
          );
        }
      };

      /*
      JSON-LD.
      */

      for (
        const script of
          document.querySelectorAll(
            'script[type="application/ld+json"]'
          )
      ) {
        try {
          const data =
            JSON.parse(
              script.textContent ||
                ""
            );

          const objects =
            Array.isArray(data)
              ? data
              : [data];

          for (
            const object of
              objects
          ) {
            add(
              object?.price
            );

            if (
              object?.offers
            ) {
              const offers =
                Array.isArray(
                  object.offers
                )
                  ? object.offers
                  : [
                      object.offers,
                    ];

              for (
                const offer of
                  offers
              ) {
                add(
                  offer?.price
                );

                add(
                  offer?.lowPrice
                );
              }
            }
          }
        } catch {
          // Ignore.
        }
      }

      /*
      Meta.
      */

      for (
        const selector of [
          'meta[property="product:price:amount"]',
          'meta[itemprop="price"]',
        ]
      ) {
        add(
          document.querySelector(
            selector
          )?.content
        );
      }

      /*
      Data attributes.
      */

      for (
        const element of
          document.querySelectorAll(
            "[data-price], [data-product-price]"
          )
      ) {
        add(
          element.getAttribute(
            "data-price"
          )
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

      for (
        const element of
          document.querySelectorAll(
            [
              '[class*="product-price"]',
              '[class*="Product-price"]',
              '[class*="productPrice"]',
              '[class*="price"]',
              '[class*="Price"]',
              '[class*="montant"]',
              '[class*="Montant"]',
            ].join(",")
          )
      ) {
        add(
          element.innerText
        );
      }

      return values;
    });

  /*
  Strong price patterns first.
  */

  for (
    const candidate of
      candidates
  ) {
    const text =
      String(candidate || "");

    const patterns = [
      /(\d[\d\s.,]{1,})\s*(?:دج|DA|DZD)\b/i,

      /(?:السعر|prix|price|montant)\s*[:：]?\s*(\d[\d\s.,]*)/i,
    ];

    for (
      const pattern of
        patterns
    ) {
      const match =
        text.match(pattern);

      if (!match) {
        continue;
      }

      const price =
        parsePrice(
          match[1]
        );

      if (
        price > 0 &&
        price < 100000000
      ) {
        return price;
      }
    }
  }

  /*
  Direct numeric candidates.
  */

  for (
    const candidate of
      candidates
  ) {
    const text =
      String(candidate || "")
        .trim();

    if (
      !/^\d[\d\s.,]*$/.test(
        text
      )
    ) {
      continue;
    }

    const price =
      parsePrice(text);

    if (
      price > 0 &&
      price < 100000000
    ) {
      return price;
    }
  }

  return 0;
}

/*
=========================================================
 CANONICAL LINK
=========================================================
*/

async function extractCanonical(
  page,
  fallbackUrl
) {
  const canonical =
    await page
      .locator(
        'link[rel="canonical"]'
      )
      .getAttribute("href")
      .catch(() => null);

  const canonicalUrl =
    normalizeUrl(
      canonical,
      page.url()
    );

  const id =
    productIdFromUrl(
      canonicalUrl
    ) ||
    productIdFromUrl(
      page.url()
    ) ||
    productIdFromUrl(
      fallbackUrl
    );

  if (!id) {
    return normalizeProductUrl(
      fallbackUrl
    );
  }

  return normalizeProductUrl(
    `/store/${id}`
  );
}

/*
=========================================================
 LOGIN PAGE DETECTION

 لا نفحص body كله بحثًا عن كلمة login،
 لأن صفحة المنتج يمكن أن تحتوي كلمات مشابهة.
 نعتمد أولاً على URL وحقول login.
=========================================================
*/

async function isLoginPage(
  page
) {
  const url =
    page.url();

  if (
    /\/login(?:[/?#]|$)/i.test(
      url
    )
  ) {
    return true;
  }

  const passwordCount =
    await page
      .locator(
        'input[type="password"]'
      )
      .count()
      .catch(() => 0);

  if (
    passwordCount > 0
  ) {
    return true;
  }

  return false;
}

/*
=========================================================
 LOGIN
=========================================================
*/

async function login(
  page
) {
  console.log(
    "🔐 Opening Sawa9ly login..."
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
    RENDER_WAIT
  );

  if (
    !(await isLoginPage(
      page
    ))
  ) {
    console.log(
      "✅ Existing authenticated session detected."
    );

    return;
  }

  if (
    !config.sawa9ly.email ||
    !config.sawa9ly.password
  ) {
    throw new Error(
      "SAWA9LY_EMAIL / SAWA9LY_PASSWORD are missing."
    );
  }

  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[autocomplete="email"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="e-mail" i]',
  ];

  let emailInput = null;

  for (
    const selector of
      emailSelectors
  ) {
    const locator =
      page
        .locator(selector)
        .first();

    if (
      await locator.count()
    ) {
      emailInput =
        locator;

      break;
    }
  }

  if (!emailInput) {
    throw new Error(
      "Could not find Sawa9ly email input."
    );
  }

  await emailInput.fill(
    config.sawa9ly.email
  );

  const passwordInput =
    page
      .locator(
        'input[type="password"]'
      )
      .first();

  if (
    !(await passwordInput.count())
  ) {
    throw new Error(
      "Could not find Sawa9ly password input."
    );
  }

  await passwordInput.fill(
    config.sawa9ly.password
  );

  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Connexion")',
    'button:has-text("Se connecter")',
    'button:has-text("Login")',
    'button:has-text("Sign in")',
    'button:has-text("تسجيل الدخول")',
  ];

  let submitted = false;

  for (
    const selector of
      submitSelectors
  ) {
    const button =
      page
        .locator(selector)
        .first();

    if (
      await button
        .count()
        .catch(() => 0)
    ) {
      await button.click();

      submitted = true;

      break;
    }
  }

  if (!submitted) {
    await passwordInput.press(
      "Enter"
    );
  }

  await page.waitForTimeout(
    Math.max(
      2000,
      Number(
        process.env.LOGIN_WAIT_MS ||
          5000
      )
    )
  );

  if (
    await isLoginPage(
      page
    )
  ) {
    throw new Error(
      "Sawa9ly login failed or session was not established."
    );
  }

  console.log(
    `✅ Sawa9ly authenticated: ${page.url()}`
  );
}

/*
=========================================================
 PRODUCT PAGE PREPARATION
=========================================================
*/

async function prepareProductPage(
  page
) {
  await page
    .waitForLoadState(
      "domcontentloaded",
      {
        timeout:
          PAGE_TIMEOUT,
      }
    )
    .catch(() => {});

  await page.waitForTimeout(
    RENDER_WAIT
  );

  /*
  Give dynamic content one chance
  to appear.
  */

  await Promise.race([
    page
      .waitForSelector(
        "h1",
        {
          timeout: 8000,
        }
      )
      .catch(() => {}),

    page
      .waitForSelector(
        '[class*="product"]',
        {
          timeout: 8000,
        }
      )
      .catch(() => {}),

    page
      .waitForSelector(
        '[class*="price"]',
        {
          timeout: 8000,
        }
      )
      .catch(() => {}),
  ]);

  await page.waitForTimeout(
    Math.min(
      1000,
      RENDER_WAIT
    )
  );
}

/*
=========================================================
 EXTRACT ONE PRODUCT
=========================================================
*/

async function extractProduct(
  page,
  originalUrl
) {
  const normalizedUrl =
    normalizeProductUrl(
      originalUrl
    );

  if (!normalizedUrl) {
    throw new Error(
      `Invalid product URL: ${originalUrl}`
    );
  }

  const requestedId =
    productIdFromUrl(
      normalizedUrl
    );

  if (!requestedId) {
    throw new Error(
      `Could not extract product ID from ${normalizedUrl}`
    );
  }

  await page.goto(
    normalizedUrl,
    {
      waitUntil:
        "domcontentloaded",
      timeout:
        NAVIGATION_TIMEOUT,
    }
  );

  await prepareProductPage(
    page
  );

  if (
    await isLoginPage(
      page
    )
  ) {
    throw new Error(
      "Sawa9ly session expired while scraping."
    );
  }

  const bodyText =
    cleanText(
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    );

  if (
    /page not found|product not found|\b404\b/i.test(
      bodyText
    )
  ) {
    throw new Error(
      "Sawa9ly product page returned Not Found."
    );
  }

  const finalId =
    productIdFromUrl(
      page.url()
    ) ||
    requestedId;

  if (!finalId) {
    throw new Error(
      "Could not determine final Sawa9ly product ID."
    );
  }

  const name =
    await extractName(
      page
    );

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
    await extractBasePrice(
      page
    );

  if (
    !basePrice ||
    basePrice <= 0
  ) {
    throw new Error(
      `Product ${finalId}: valid source price not found.`
    );
  }

  const imageData =
    await extractImages(
      page
    );

  if (
    !imageData.image ||
    !imageData.images.length
  ) {
    throw new Error(
      `Product ${finalId}: product image not found.`
    );
  }

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
    sawa9lyId:
      String(finalId),

    name:
      cleanText(name),

    description:
      cleanText(description),

    basePrice:
      Number(basePrice),

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

    available:
      true,

    automated:
      true,

    scrapedAt:
      new Date().toISOString(),
  };
}

/*
=========================================================
 LOAD PRODUCT LINKS
=========================================================
*/

function loadProductLinks() {
  if (
    !fs.existsSync(
      linksFile
    )
  ) {
    throw new Error(
      `product-links.json not found: ${linksFile}`
    );
  }

  const raw =
    readJson(
      linksFile,
      null
    );

  if (
    !Array.isArray(raw)
  ) {
    throw new Error(
      "product-links.json must contain an array."
    );
  }

  const map =
    new Map();

  for (
    const item of raw
  ) {
    const href =
      typeof item ===
      "string"
        ? item
        : item?.href;

    const normalized =
      normalizeProductUrl(
        href
      );

    if (!normalized) {
      continue;
    }

    const id =
      productIdFromUrl(
        normalized
      );

    if (!id) {
      continue;
    }

    if (
      !map.has(id)
    ) {
      map.set(
        id,
        {
          sawa9lyId:
            id,

          href:
            normalized,
        }
      );
    }
  }

  return [
    ...map.values(),
  ];
}

/*
=========================================================
 DISCOVERY SAFETY
=========================================================
*/

function validateDiscoverySafety(
  productLinks
) {
  if (
    !fs.existsSync(
      discoveryReportFile
    )
  ) {
    throw new Error(
      "discovery-report.json is missing. Scraper will not continue."
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

  if (
    report.complete !== true
  ) {
    throw new Error(
      "Discovery is not complete. Scraping stopped for safety."
    );
  }

  if (
    report.availabilitySafe !==
    true
  ) {
    throw new Error(
      "Discovery is not availability-safe. Scraping stopped."
    );
  }

  const discovered =
    Number(
      report.uniqueProductsFound ??
        report.discovered ??
        report.productsFound ??
        0
    );

  if (
    discovered <= 0
  ) {
    throw new Error(
      "Discovery report contains zero products."
    );
  }

  if (
    productLinks.length === 0
  ) {
    throw new Error(
      "Discovery reports products but product-links.json is empty."
    );
  }

  /*
  Important:
  product-links should not suddenly become
  dramatically smaller than Discovery.
  */

  if (
    productLinks.length <
    Math.floor(
      discovered * 0.99
    )
  ) {
    throw new Error(
      `Product link mismatch: Discovery=${discovered}, Links=${productLinks.length}.`
    );
  }

  return report;
}

/*
=========================================================
 PROGRESS
=========================================================
*/

function saveProgress({
  total,
  completed,
  successful,
  failed,
}) {
  const coverage =
    total > 0
      ? Number(
          (
            successful /
            total
          ).toFixed(4)
        )
      : 0;

  writeJson(
    progressFile,
    {
      updatedAt:
        new Date().toISOString(),

      total,

      completed,

      successful,

      failed,

      coverage,
    }
  );
}

/*
=========================================================
 MAIN
=========================================================
*/

async function main() {
  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    " PRIX CHOC - SAWA9LY PRODUCT SCRAPER"
  );
  console.log(
    "=================================================="
  );
  console.log("");

  /*
  1. LOAD DISCOVERY
  */

  const productLinks =
    loadProductLinks();

  const discoveryReport =
    validateDiscoverySafety(
      productLinks
    );

  /*
  2. SELECT PRODUCTS
  */

  const selectedLinks =
    productLinks.slice(
      0,
      Math.min(
        SCRAPE_LIMIT,
        productLinks.length
      )
    );

  if (
    selectedLinks.length ===
    0
  ) {
    throw new Error(
      "No products selected for scraping."
    );
  }

  /*
  3. SAFETY FOR PARTIAL SCRAPE

  إذا كان scrapeLimit أقل من عدد
  المنتجات المكتشفة، لا يجوز اعتبار
  النتيجة الكاملة قاعدة للمزامنة.
  */

  const fullCatalogSelected =
    selectedLinks.length ===
    productLinks.length;

  console.log(
    `📦 Discovery products : ${productLinks.length}`
  );

  console.log(
    `🔎 Selected to scrape : ${selectedLinks.length}`
  );

  console.log(
    `⚙️ Concurrency         : ${Math.min(
      CONCURRENCY,
      selectedLinks.length
    )}`
  );

  console.log(
    `🛡️ Minimum coverage   : ${(
      MINIMUM_COVERAGE *
      100
    ).toFixed(2)}%`
  );

  if (
    !fullCatalogSelected
  ) {
    console.warn("");
    console.warn(
      "⚠️ SCRAPE_LIMIT is smaller than the discovered catalog."
    );

    console.warn(
      "⚠️ This run will NOT be considered a full synchronization."
    );
  }

  /*
  4. BROWSER
  */

  const browser =
    await chromium.launch({
      headless:
        config.automation.headless,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

  const context =
    await browser.newContext({
      viewport:
        config.browser.viewport,

      locale:
        "fr-DZ",

      timezoneId:
        "Africa/Algiers",

      userAgent:
        config.browser.userAgent,
    });

  context.setDefaultTimeout(
    PAGE_TIMEOUT
  );

  context.setDefaultNavigationTimeout(
    NAVIGATION_TIMEOUT
  );

  /*
  Do NOT block images.
  They are required.
  */

  await context.route(
    "**/*",
    async (route) => {
      const type =
        route
          .request()
          .resourceType();

      if (
        type === "font" ||
        type === "media"
      ) {
        await route
          .abort()
          .catch(() => {});

        return;
      }

      await route
        .continue()
        .catch(() => {});
    }
  );

  /*
  5. LOGIN
  */

  const loginPage =
    await context.newPage();

  try {
    await login(
      loginPage
    );
  } finally {
    await loginPage
      .close()
      .catch(() => {});
  }

  /*
  6. WORKERS
  */

  const concurrency =
    Math.min(
      CONCURRENCY,
      selectedLinks.length
    );

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

  async function worker(
    page,
    workerNumber
  ) {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >=
        selectedLinks.length
      ) {
        break;
      }

      const item =
        selectedLinks[index];

      const position =
        index + 1;

      let product = null;
      let lastError = null;

      /*
      Two attempts.
      */

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
          lastError =
            error;

          if (
            attempt === 1
          ) {
            await sleep(700);
          }
        }
      }

      completed++;

      if (product) {
        products.push(
          product
        );

        console.log(
          `✅ ${position}/${selectedLinks.length} | ` +
          `Worker ${workerNumber} | ` +
          `${product.sawa9lyId} | ` +
          `${product.basePrice} DA | ` +
          `${product.images.length} images`
        );
      } else {
        const failedItem = {
          position,

          sawa9lyId:
            item.sawa9lyId,

          href:
            item.href,

          error:
            lastError?.message ||
            String(
              lastError ||
                "Unknown scraping error."
            ),

          failedAt:
            new Date().toISOString(),
        };

        failed.push(
          failedItem
        );

        console.error(
          `❌ ${position}/${selectedLinks.length} | ` +
          `Worker ${workerNumber} | ` +
          `${item.sawa9lyId} | ` +
          `${failedItem.error}`
        );
      }

      saveProgress({
        total:
          selectedLinks.length,

        completed,

        successful:
          products.length,

        failed:
          failed.length,
      });
    }
  }

  /*
  7. RUN WORKERS
  */

  try {
    await Promise.all(
      pages.map(
        (page, index) =>
          worker(
            page,
            index + 1
          )
      )
    );
  } finally {
    for (
      const page of pages
    ) {
      await page
        .close()
        .catch(() => {});
    }

    await context
      .close()
      .catch(() => {});

    await browser
      .close()
      .catch(() => {});
  }

  /*
  8. SORT
  */

  products.sort(
    (a, b) =>
      Number(
        a.sawa9lyId
      ) -
      Number(
        b.sawa9lyId
      )
  );

  failed.sort(
    (a, b) =>
      Number(
        a.position
      ) -
      Number(
        b.position
      )
  );

  /*
  9. COVERAGE
  */

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
            successful /
            total
          ).toFixed(4)
        )
      : 0;

  const coverageSafe =
    coverage >=
    MINIMUM_COVERAGE;

  /*
  IMPORTANT:

  إذا كان scrapeLimit أصغر من
  الكتالوج، لا نعتبر العملية
  Full Sync.
  */

  const completeCatalog =
    fullCatalogSelected;

  const safeToPublish =
    completeCatalog &&
    coverageSafe &&
    successful > 0;

  /*
  10. SAVE RAW
  */

  writeJson(
    outputFile,
    products
  );

  /*
  11. SAVE FAILED
  */

  writeJson(
    failedProductsFile,
    failed
  );

  /*
  12. REPORT
  */

  const report = {
    generatedAt:
      new Date().toISOString(),

    discoveryProducts:
      Number(
        discoveryReport
          .uniqueProductsFound ??
          discoveryReport
            .discovered ??
          discoveryReport
            .productsFound ??
          0
      ),

    discovered:
      productLinks.length,

    selected:
      selectedLinks.length,

    scraped:
      successful,

    failed:
      failedCount,

    coverage,

    minimumSafeCoverage:
      MINIMUM_COVERAGE,

    coveragePercent:
      Number(
        (
          coverage * 100
        ).toFixed(2)
      ),

    coverageSafe,

    fullCatalogSelected:

      fullCatalogSelected,

    completeCatalog,

    complete:
      failedCount === 0 &&
      completeCatalog,

    safeToPublish,

    outputFile,

    failedProductsFile,
  };

  writeJson(
    scraperReportFile,
    report
  );

  /*
  13. FINAL LOG
  */

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
    `📊 Coverage   : ${(coverage * 100).toFixed(
      2
    )}%`
  );

  console.log(
    `📚 Full sync  : ${
      fullCatalogSelected
        ? "YES"
        : "NO"
    }`
  );

  console.log(
    `🛡️ Safe       : ${
      safeToPublish
        ? "YES"
        : "NO"
    }`
  );

  console.log("");

  /*
  14. HARD SAFETY STOP
  */

  if (
    !fullCatalogSelected
  ) {
    throw new Error(
      `Scraping stopped safely because SCRAPE_LIMIT (${SCRAPE_LIMIT}) is smaller than the discovered catalog (${productLinks.length}).`
    );
  }

  if (
    !coverageSafe
  ) {
    throw new Error(
      `Scraping coverage too low: ${(coverage * 100).toFixed(
        2
      )}%. Minimum required: ${(
        MINIMUM_COVERAGE * 100
      ).toFixed(2)}%.`
    );
  }

  /*
  لا نرفض فشل بعض المنتجات
  إذا كانت التغطية آمنة.

  generator.js سيحتفظ بالبيانات
  القديمة للمنتجات التي فشل
  scraping لها.
  */

  console.log(
    `📄 Raw products: ${outputFile}`
  );

  console.log(
    `📄 Report: ${scraperReportFile}`
  );

  console.log(
    `📄 Failed: ${failedProductsFile}`
  );

  console.log("");

  console.log(
    "✅ Scraper completed safely."
  );
}

/*
=========================================================
 ERROR HANDLER
=========================================================
*/

main().catch(
  (error) => {
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

    process.exit(
      1
    );
  }
);
