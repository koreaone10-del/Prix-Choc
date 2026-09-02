import { chromium } from "playwright";
import fs from "fs";
import path from "path";

import { config } from "./config.js";

const debugDir = path.resolve("./debug");

fs.mkdirSync(debugDir, {
    recursive: true
});

function cleanText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

console.log("");
console.log("======================================");
console.log("   PRIX CHOC - SAWA9LY DISCOVERY");
console.log("======================================");
console.log("");

console.log("🔐 قراءة بيانات الدخول من .env...");

if (!config.sawa9ly.email) {
    console.error("❌ SAWA9LY_EMAIL غير موجود في .env");
    process.exit(1);
}

if (!config.sawa9ly.password) {
    console.error("❌ SAWA9LY_PASSWORD غير موجود في .env");
    process.exit(1);
}

console.log("✅ بيانات الدخول موجودة.");
console.log("");

console.log("🚀 تشغيل Chromium...");

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

try {

    console.log("🌐 فتح صفحة تسجيل الدخول...");

    await page.goto(
        config.sawa9ly.loginUrl,
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    await page.waitForTimeout(2000);

    await page.screenshot({
        path: path.join(
            debugDir,
            "01-login.png"
        ),
        fullPage: true
    });

    console.log(
        "📍 صفحة الدخول:",
        page.url()
    );

    const emailInput = page.locator(
        'input[type="email"]'
    ).first();

    const passwordInput = page.locator(
        'input[type="password"]'
    ).first();

    console.log(
        `🔎 حقول البريد: ${await emailInput.count()}`
    );

    console.log(
        `🔎 حقول كلمة السر: ${await passwordInput.count()}`
    );

    if (
        await emailInput.count() === 0 ||
        await passwordInput.count() === 0
    ) {
        throw new Error(
            "لم يتم العثور على حقول تسجيل الدخول."
        );
    }

    console.log("");
    console.log("✍️ إدخال بيانات الحساب...");

    await emailInput.fill(
        config.sawa9ly.email
    );

    await passwordInput.fill(
        config.sawa9ly.password
    );

    console.log("🖱️ البحث عن زر تسجيل الدخول...");

    const submitButton = page.locator(
        'button[type="submit"]'
    ).first();

    if (
        await submitButton.count() > 0
    ) {

        await submitButton.click();

    } else {

        console.log(
            "⌨️ زر Submit غير موجود، استخدام Enter..."
        );

        await passwordInput.press(
            "Enter"
        );
    }

    console.log(
        "⏳ انتظار انتهاء تسجيل الدخول..."
    );

    await page.waitForTimeout(5000);

    console.log("");
    console.log(
        "📍 الرابط بعد تسجيل الدخول:"
    );

    console.log(
        page.url()
    );

    await page.screenshot({
        path: path.join(
            debugDir,
            "02-after-login.png"
        ),
        fullPage: true
    });

    if (
        /\/login/i.test(page.url())
    ) {

        console.error("");
        console.error(
            "❌ تسجيل الدخول لم ينتقل من صفحة Login."
        );

        console.error(
            "راجع الصورة:"
        );

        console.error(
            "debug/02-after-login.png"
        );

        await browser.close();

        process.exit(1);
    }

    console.log("");
    console.log(
        "✅ يبدو أن تسجيل الدخول نجح."
    );

    console.log("");
    console.log(
        "🚀 فتح لوحة التحكم..."
    );

    await page.goto(
        config.sawa9ly.dashboardUrl,
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    await page.waitForTimeout(3000);

    console.log("");
    console.log(
        "📍 Dashboard:"
    );

    console.log(
        page.url()
    );

    await page.screenshot({
        path: path.join(
            debugDir,
            "03-dashboard.png"
        ),
        fullPage: true
    });

    const html =
        await page.content();

    fs.writeFileSync(
        path.join(
            debugDir,
            "dashboard.html"
        ),
        html,
        "utf8"
    );

    const links =
        await page
            .locator("a")
            .evaluateAll(
                anchors =>
                    anchors.map(
                        a => ({
                            text:
                                cleanText(
                                    a.innerText
                                ),
                            href:
                                a.href
                        })
                    )
            );

    const uniqueLinks = [
        ...new Map(
            links
                .filter(
                    item =>
                        item.href
                )
                .map(
                    item => [
                        item.href,
                        item
                    ]
                )
        ).values()
    ];

    fs.writeFileSync(
        path.join(
            debugDir,
            "links.json"
        ),
        JSON.stringify(
            uniqueLinks,
            null,
            2
        ),
        "utf8"
    );

    const productLinks =
        uniqueLinks.filter(
            item =>
                /\/product\/\d+/i.test(
                    item.href
                )
        );

    fs.writeFileSync(
        path.join(
            debugDir,
            "product-links.json"
        ),
        JSON.stringify(
            productLinks,
            null,
            2
        ),
        "utf8"
    );

    console.log("");
    console.log(
        "======================================"
    );

    console.log(
        "       DISCOVERY COMPLETED"
    );

    console.log(
        "======================================"
    );

    console.log("");

    console.log(
        `🔗 إجمالي الروابط: ${uniqueLinks.length}`
    );

    console.log(
        `🛍️ روابط المنتجات: ${productLinks.length}`
    );

    console.log("");

    console.log(
        "📁 تم إنشاء:"
    );

    console.log(
        "debug/01-login.png"
    );

    console.log(
        "debug/02-after-login.png"
    );

    console.log(
        "debug/03-dashboard.png"
    );

    console.log(
        "debug/dashboard.html"
    );

    console.log(
        "debug/links.json"
    );

    console.log(
        "debug/product-links.json"
    );

    console.log("");

} catch (error) {

    console.error("");
    console.error(
        "❌ حدث خطأ:"
    );

    console.error(
        error.message
    );

    console.error("");

    try {

        await page.screenshot({
            path: path.join(
                debugDir,
                "ERROR.png"
            ),
            fullPage: true
        });

        console.error(
            "📸 تم حفظ صورة الخطأ:"
        );

        console.error(
            "debug/ERROR.png"
        );

    } catch {}

    await browser.close();

    process.exit(1);
}

await browser.close();
