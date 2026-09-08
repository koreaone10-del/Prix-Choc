# Prix-Choc — correction finale (صور + البلديات + السعر + التصميم)

هذه الحزمة مبنية على الملفات الحالية التي تم تزويدنا بها، مع التعديلات المستهدفة فقط.

## الملفات
- Prix-Choc/index.html — تحسين بصري نهائي: أخضر داكن مسيطر، نص أكبر وأوضح، بطاقات وخانات وحدود أوضح، بدون تغيير order payload.
- Prix-Choc/automation-scraper.js — استخراج الصور بجودة أعلى وترتيب المرشحين حسب الجودة والدقة.
- Prix-Choc/locations.js — إضافة مطابقة المقارين/تقرت وبعض أسماء البلديات.
- Prix-Choc/config.js — الهامش الافتراضي 500 دج، والحد الأعلى 2500 دج.
- Prix-Choc/pricing.js — يستخدم إعدادات config للتسعير.
- prix-choc-bot/server.js — تحسين اختيار الولاية/البلدية مع fallback أكثر قوة مع الحفاظ على المسار الناجح.
- prix-choc-bot/locations.js — نفس خريطة المطابقة للبوت.

## فحوصات محلية
- Node syntax: scraper / server / locations / config / pricing: PASS
- HTML structure sanity: PASS
- Mapping: المقارين -> Megarine: PASS

## ملاحظة مهمة
نجاح التشغيل الحي مع Sawa9ly لا يمكن ضمانه 100% من دون نشر هذه النسخة وتنفيذ طلب حي فعلي. الحزمة نفسها تم إنشاؤها والتحقق من سلامتها قبل التسليم.
