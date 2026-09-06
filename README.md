# Prix-Choc — Full Sawa9ly Catalog Sync

هذه الحزمة تستبدل ملفات الأتمتة التالية كاملة:

- automation/config.js
- automation/discover.js
- automation/scraper.js
- automation/sync.js
- automation/generator.js
- .github/workflows/products-sync.yml

## الوظائف

1. استخدام Sawa9ly Affiliate الجديدة:
   https://affiliate.sawa9ly.pro/

2. استخدام روابط المنتجات:
   /store/:id

3. اكتشاف جميع المنتجات يوميًا.

4. Scraping للمنتجات الموجودة والجديدة، وليس الجديدة فقط.

5. تحديث:
   - الاسم
   - الوصف
   - سعر التكلفة
   - سعر البيع
   - الربح
   - الصورة الرئيسية
   - images[]

6. عدم حذف المنتجات من products.js.

7. بعد غياب المنتج في عدد التشغيلات المحدد:
   available: false

8. عند عودة المنتج:
   available: true

9. إذا فشل Discovery:
   لا يتم تغيير availability.

10. إذا فشل Scraping لمنتج:
    تبقى بياناته القديمة ولا يتم حذفه.

11. التشغيل اليومي:
    02:00 UTC = 03:00 بتوقيت الجزائر.

## GitHub Secrets المطلوبة

- SAWA9LY_EMAIL
- SAWA9LY_PASSWORD

## ملاحظة

واجهة index.html الحالية في المشروع تدعم images[] بالفعل حسب البنية الحالية للمشروع؛ لذلك لا تحتاج إلى استبدالها ضمن هذه الحزمة. النظام الجديد يملأ images[] بالصور المتعددة، وتستطيع الواجهة الحالية عرضها.

## قبل الاستبدال

خذ نسخة من المستودع الحالي.

لا تحذف products.js.

بعد رفع الملفات شغّل GitHub Actions يدويًا أول مرة وراقب السجل قبل الاعتماد على التشغيل اليومي.

## الفحص

Workflow يقوم تلقائيًا بـ:

- node --check
- Discovery integrity
- Scraper output validation
- products.js syntax validation
- commit/push آمن
