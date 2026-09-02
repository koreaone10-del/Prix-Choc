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
console.log("       PRIX CHOC - SAWA9LY");
console.log("            DISCOVERY");
console.log("======================================");
console.log("");

/*
 * التأكد من وجود بيانات الدخول
 * بدون طباعة البريد أو كلمة السر
 */

if (!config?.sawa9ly?.email) {
    console.error("❌ SAWA9LY_EMAIL غير موجود في .env");
    process.exit(1);
}

if (!config?.sawa9ly?.password) {
    console.error("❌ SAWA9LY_PASSWORD غير موجود في .env");
    process.exit(1);
}

console.log("✅ بيانات حساب سوقلي موجودة في .env.");
console.log("");

console.log("🚀 تشغيل Chromium...");

const browser = await chromium.launch({
    headless: config.automation?.headless ?? true
});

const context = await browser.newContext({
    viewport: {
        width: 1440,
        height: 900
    }
});

const page = await context.newPage();

try {

    // ==========================================
    // 1. فتح صفحة تسجيل الدخول
    // ==========================================

    console.log("🌐 فتح صفحة تسجيل الدخول...");

    await page.goto(
        config.sawa9ly.loginUrl,
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    await page.waitForTimeout(2000);

    console.log(
        "📍 Login URL:",
        page.url()
    );

    await page.screenshot({
        path: path.join(
            debugDir,
            "01-login.png"
        ),
        fullPage: true
    });

    // ==========================================
    // 2. البحث عن حقول الدخول
    // ==========================================

    const emailInput = page
        .locator('input[type="email"]')
        .first();

    const passwordInput = page
        .locator('input[type="password"]')
        .first();

    const emailCount =
        await page.locator(
            'input[type="email"]'
        ).count();

    const passwordCount =
        await page.locator(
            'input[type="password"]'
        ).count();

    console.log(
        `🔎 حقول البريد الموجودة: ${emailCount}`
    );

    console.log(
        `🔎 حقول كلمة السر الموجودة: ${passwordCount}`
    );

    if (
        emailCount === 0 ||
        passwordCount === 0
    ) {
        throw new Error(
            "لم يتم العثور على حقول تسجيل الدخول في صفحة سوقلي."
        );
    }

    // ==========================================
    // 3. إدخال بيانات الحساب
    // ==========================================

    console.log("");
    console.log("✍️ إدخال بيانات الحساب...");

    await emailInput.fill(
        config.sawa9ly.email
    );

    await passwordInput.fill(
        config.sawa9ly.password
    );

    // ==========================================
    // 4. الضغط على زر الدخول
    // ==========================================

    console.log(
        "🖱️ البحث عن زر تسجيل الدخول..."
    );

    const submitButton = page
        .locator('button[type="submit"]')
        .first();

    if (
        await submitButton.count() > 0
    ) {

        console.log(
            "✅ تم العثور على زر الدخول."
        );

        await submitButton.click();

    } else {

        console.log(
            "⚠️ لم يتم العثور على زر Submit."
        );

        console.log(
            "⌨️ سيتم الضغط على Enter داخل كلمة السر."
        );

        await passwordInput.press(
            "Enter"
        );
    }

    // ==========================================
    // 5. انتظار تسجيل الدخول
    // ==========================================

    console.log("");
    console.log(
        "⏳ انتظار انتهاء تسجيل الدخول..."
    );

    await page.waitForTimeout(5000);

    console.log("");
    console.log(
        "📍 الرابط الحالي:"
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

    // ==========================================
    // 6. التأكد من عدم البقاء في Login
    // ==========================================

    if (
        /\/login/i.test(
            page.url()
        )
    ) {

        console.error("");
        console.error(
            "❌ لم ينجح تسجيل الدخول."
        );

        console.error("");
        console.error(
            "📸 راجع الصورة:"
        );

        console.error(
            "debug/02-after-login.png"
        );

        await browser.close();

        process.exit(1);
    }

    console.log("");
    console.log(
        "✅ يبدو أن تسجيل الدخول نجح!"
    );

    // ==========================================
    // 7. فتح Dashboard
    // ==========================================

    console.log("");
    console.log(
        "🚀 فتح لوحة تحكم سوقلي..."
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
        "📍 Dashboard URL:"
    );

    console.log(
        page.url()
    );

    // ==========================================
    // 8. حفظ Screenshot
    // ==========================================

    await page.screenshot({
        path: path.join(
            debugDir,
            "03-dashboard.png"
        ),
        fullPage: true
    });

    // ==========================================
    // 9. حفظ HTML
    // ==========================================

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

    console.log(
        "💾 تم حفظ dashboard.html"
    );

    // ==========================================
    // 10. استخراج جميع الروابط
    // ==========================================

    console.log("");
    console.log(
        "🔎 استخراج الروابط..."
    );

    const links =
        await page
            .locator("a")
            .evaluateAll(
                anchors =>
                    anchors.map(
                        anchor => ({
                            text:
                                cleanText(
                                    anchor.innerText
                                ),

                            href:
                                anchor.href
                        })
                    )
            );

    // إزالة الروابط المكررة

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

    console.log(
        `🔗 إجمالي الروابط: ${uniqueLinks.length}`
    );

    // ==========================================
    // 11. استخراج روابط المنتجات
    // ==========================================

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

    console.log(
        `🛍️ روابط المنتجات: ${productLinks.length}`
    );

    // ==========================================
    // 12. النهاية
    // ==========================================

    console.log("");
    console.log("======================================");
    console.log("       DISCOVERY COMPLETED");
    console.log("======================================");
    console.log("");

    console.log(
        "📁 الملفات التي تم إنشاؤها:"
    );

    console.log(
        "   debug/01-login.png"
    );

    console.log(
        "   debug/02-after-login.png"
    );

    console.log(
        "   debug/03-dashboard.png"
    );

    console.log(
        "   debug/dashboard.html"
    );

    console.log(
        "   debug/links.json"
    );

    console.log(
        "   debug/product-links.json"
    );

    console.log("");

} catch (error) {

    console.error("");
    console.error("======================================");
    console.error("             ERROR");
    console.error("======================================");
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
