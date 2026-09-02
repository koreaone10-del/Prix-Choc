import { chromium } from "playwright";
import fs from "fs";
import path from "path";

import { config, validateConfig } from "./config.js";

validateConfig();

const outputDir = path.resolve("./debug");

fs.mkdirSync(outputDir, {
    recursive: true
});

const browser = await chromium.launch({
    headless: config.automation.headless
});

const context = await browser.newContext({
    viewport: {
        width: 1440,
        height: 900
    }
});

const page = await context.newPage();

console.log("\n======================================");
console.log("   PRIX CHOC - SAWA9LY DISCOVERY");
console.log("======================================\n");

console.log("🌐 Opening Sawa9ly login...");

await page.goto(config.sawa9ly.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
});

await page.screenshot({
    path: path.join(outputDir, "01-login.png"),
    fullPage: true
});

console.log("🔐 Login page loaded.");

const emailInput = page.locator(
    'input[type="email"]'
).first();

const passwordInput = page.locator(
    'input[type="password"]'
).first();

if (
    await emailInput.count() > 0 &&
    await passwordInput.count() > 0
) {
    console.log("✍️ Filling login form...");

    await emailInput.fill(
        config.sawa9ly.email
    );

    await passwordInput.fill(
        config.sawa9ly.password
    );

    const submitButton = page.locator(
        'button[type="submit"]'
    ).first();

    if (await submitButton.count() > 0) {
        await submitButton.click();
    } else {
        await passwordInput.press("Enter");
    }

    await page.waitForTimeout(3000);
}

console.log(
    "📍 Current URL:",
    page.url()
);

await page.screenshot({
    path: path.join(outputDir, "02-after-login.png"),
    fullPage: true
});

console.log("\n🚀 Opening dashboard...");

await page.goto(config.sawa9ly.dashboardUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
});

await page.waitForTimeout(3000);

console.log(
    "📍 Dashboard URL:",
    page.url()
);

await page.screenshot({
    path: path.join(outputDir, "03-dashboard.png"),
    fullPage: true
});

const html = await page.content();

fs.writeFileSync(
    path.join(outputDir, "dashboard.html"),
    html,
    "utf8"
);

const links = await page.locator("a").evaluateAll(
    anchors =>
        anchors.map(a => ({
            text: (a.innerText || "").trim(),
            href: a.href
        }))
);

const uniqueLinks = [
    ...new Map(
        links
            .filter(x => x.href)
            .map(x => [x.href, x])
    ).values()
];

fs.writeFileSync(
    path.join(outputDir, "links.json"),
    JSON.stringify(
        uniqueLinks,
        null,
        2
    ),
    "utf8"
);

console.log(
    `🔎 Found ${uniqueLinks.length} unique links.`
);

const productLinks = uniqueLinks.filter(
    item =>
        /\/product\/\d+/i.test(item.href)
);

fs.writeFileSync(
    path.join(outputDir, "product-links.json"),
    JSON.stringify(
        productLinks,
        null,
        2
    ),
    "utf8"
);

console.log(
    `🛍️ Found ${productLinks.length} product links.`
);

console.log("\n======================================");
console.log("Discovery finished.");
console.log("======================================");

console.log("\nGenerated files:");

console.log(
    "- debug/01-login.png"
);

console.log(
    "- debug/02-after-login.png"
);

console.log(
    "- debug/03-dashboard.png"
);

console.log(
    "- debug/dashboard.html"
);

console.log(
    "- debug/links.json"
);

console.log(
    "- debug/product-links.json"
);

console.log("\n");

await browser.close();
