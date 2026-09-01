/**
 * Prix-Choc / Sawa9ly - database.js
 * ============================================================
 * قاعدة البيانات الموحدة للموقع + بوت Sawa9ly
 *
 * القرار المعتمد:
 * - 58 ولاية (01 -> 58) كما يعتمدها نظام الشحن القديم/سوقلي.
 * - 1541 بلدية.
 * - لا نستعمل الولايات 59 -> 69 في طلبات البوت.
 *
 * مصدر بيانات البلديات المفتوح:
 * https://github.com/DZBuild-com/dzship
 *
 * Node.js 18+ مطلوب لأن الملف يستعمل fetch المدمج.
 * ============================================================
 */

'use strict';

// ============================================================
// 🇩🇿 الولايات الـ58
// ============================================================

const WILAYAS_58 = [
  ['01', 'Adrar', 'أدرار'],
  ['02', 'Chlef', 'الشلف'],
  ['03', 'Laghouat', 'الأغواط'],
  ['04', 'Oum El Bouaghi', 'أم البواقي'],
  ['05', 'Batna', 'باتنة'],
  ['06', 'Béjaïa', 'بجاية'],
  ['07', 'Biskra', 'بسكرة'],
  ['08', 'Béchar', 'بشار'],
  ['09', 'Blida', 'البليدة'],
  ['10', 'Bouira', 'البويرة'],
  ['11', 'Tamanrasset', 'تمنراست'],
  ['12', 'Tébessa', 'تبسة'],
  ['13', 'Tlemcen', 'تلمسان'],
  ['14', 'Tiaret', 'تيارت'],
  ['15', 'Tizi Ouzou', 'تيزي وزو'],
  ['16', 'Alger', 'الجزائر'],
  ['17', 'Djelfa', 'الجلفة'],
  ['18', 'Jijel', 'جيجل'],
  ['19', 'Sétif', 'سطيف'],
  ['20', 'Saïda', 'سعيدة'],
  ['21', 'Skikda', 'سكيكدة'],
  ['22', 'Sidi Bel Abbès', 'سيدي بلعباس'],
  ['23', 'Annaba', 'عنابة'],
  ['24', 'Guelma', 'قالمة'],
  ['25', 'Constantine', 'قسنطينة'],
  ['26', 'Médéa', 'المدية'],
  ['27', 'Mostaganem', 'مستغانم'],
  ['28', "M'Sila", 'المسيلة'],
  ['29', 'Mascara', 'معسكر'],
  ['30', 'Ouargla', 'ورقلة'],
  ['31', 'Oran', 'وهران'],
  ['32', 'El Bayadh', 'البيض'],
  ['33', 'Illizi', 'إليزي'],
  ['34', 'Bordj Bou Arreridj', 'برج بوعريريج'],
  ['35', 'Boumerdès', 'بومرداس'],
  ['36', 'El Tarf', 'الطارف'],
  ['37', 'Tindouf', 'تندوف'],
  ['38', 'Tissemsilt', 'تيسمسيلت'],
  ['39', 'El Oued', 'الوادي'],
  ['40', 'Khenchela', 'خنشلة'],
  ['41', 'Souk Ahras', 'سوق أهراس'],
  ['42', 'Tipaza', 'تيبازة'],
  ['43', 'Mila', 'ميلة'],
  ['44', 'Aïn Defla', 'عين الدفلى'],
  ['45', 'Naâma', 'النعامة'],
  ['46', 'Aïn Témouchent', 'عين تموشنت'],
  ['47', 'Ghardaïa', 'غرداية'],
  ['48', 'Relizane', 'غليزان'],
  ['49', 'Timimoun', 'تيميمون'],
  ['50', 'Bordj Badji Mokhtar', 'برج باجي مختار'],
  ['51', 'Ouled Djellal', 'أولاد جلال'],
  ['52', 'Béni Abbès', 'بني عباس'],
  ['53', 'In Salah', 'عين صالح'],
  ['54', 'In Guezzam', 'عين قزام'],
  ['55', 'Touggourt', 'تقرت'],
  ['56', 'Djanet', 'جانت'],
  ['57', "El M'Ghair", 'المغير'],
  ['58', 'El Meniaa', 'المنيعة']
].map(([code, fr, ar]) => ({
  code,
  id: Number(code),
  fr,
  ar
}));


// ============================================================
// 🔎 فهارس الولايات
// ============================================================

const WILAYA_BY_CODE = Object.fromEntries(
  WILAYAS_58.map(w => [w.code, w])
);

const WILAYA_BY_ID = Object.fromEntries(
  WILAYAS_58.map(w => [w.id, w])
);


// ============================================================
// 🏘️ مصدر البلديات
// ============================================================

const COMMUNES_SOURCE =
  'https://raw.githubusercontent.com/DZBuild-com/dzship/main/data/communes.json';

let _communesPromise = null;


// ============================================================
// 🧹 توحيد أسماء الولايات والبلديات
// ============================================================

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ڨ/g, 'ق')
    .replace(/گ/g, 'ك')
    .replace(/[’'`]/g, '')
    .replace(/[-_/.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


// ============================================================
// 📥 تحميل البلديات
// ============================================================

async function loadCommunes() {

  // إذا كانت محملة مسبقًا لا نعيد التحميل
  if (_communesPromise) {
    return _communesPromise;
  }

  _communesPromise = (async () => {

    const response = await fetch(COMMUNES_SOURCE, {
      headers: {
        'User-Agent': 'Prix-Choc-Sawa9ly-Bot/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(
        `فشل تحميل قاعدة البلديات: HTTP ${response.status}`
      );
    }

    const raw = await response.json();

    // ========================================================
    // نأخذ فقط البلديات التابعة للـ58 ولاية
    // ========================================================

    const communes = raw
      .filter(c => {
        const code = Number(c.wilayaCode);
        return code >= 1 && code <= 58;
      })
      .map((c, index) => ({
        id: index + 1,

        wilayaCode: String(c.wilayaCode)
          .padStart(2, '0'),

        fr: c.name,
        ar: c.nameAr,

        normalizedFr: normalizeName(c.name),
        normalizedAr: normalizeName(c.nameAr)
      }));


    // ========================================================
    // حماية من قاعدة ناقصة
    // ========================================================

    if (communes.length !== 1541) {

      throw new Error(
        `قاعدة البلديات غير مكتملة: تم العثور على ${communes.length} بدل 1541`
      );

    }

    return communes;

  })().catch(error => {

    // في حالة فشل التحميل نسمح بإعادة المحاولة
    _communesPromise = null;

    throw error;
  });


  return _communesPromise;
}


// ============================================================
// 🏘️ جلب بلديات ولاية معينة
// ============================================================

async function getCommunes(wilaya) {

  const communes = await loadCommunes();

  const code = resolveWilayaCode(wilaya);

  if (!code) {
    return [];
  }

  return communes.filter(
    c => c.wilayaCode === code
  );
}


// ============================================================
// 🇩🇿 تحويل الولاية إلى Code
// ============================================================

function resolveWilayaCode(value) {

  const n = normalizeName(value);

  // إذا أرسل رقم الولاية
  if (/^\d+$/.test(String(value).trim())) {

    const id = Number(value);

    if (id >= 1 && id <= 58) {
      return String(id).padStart(2, '0');
    }

    return null;
  }


  // البحث بالفرنسية أو العربية
  const found = WILAYAS_58.find(w => {

    const fr = normalizeName(w.fr);
    const ar = normalizeName(w.ar);

    return (
      fr === n ||
      ar === n ||
      fr.includes(n) ||
      n.includes(fr) ||
      ar.includes(n) ||
      n.includes(ar)
    );

  });


  return found ? found.code : null;
}


// ============================================================
// 🏘️ البحث عن بلدية
// ============================================================

async function findCommune(wilaya, commune) {

  const list = await getCommunes(wilaya);

  const target = normalizeName(commune);

  if (!target) {
    return null;
  }


  // ========================================================
  // 1️⃣ تطابق كامل
  // ========================================================

  let found = list.find(c =>
    c.normalizedFr === target ||
    c.normalizedAr === target
  );

  if (found) {
    return found;
  }


  // ========================================================
  // 2️⃣ تطابق جزئي
  // ========================================================

  found = list.find(c =>
    c.normalizedFr.includes(target) ||
    target.includes(c.normalizedFr) ||
    c.normalizedAr.includes(target) ||
    target.includes(c.normalizedAr)
  );


  return found || null;
}


// ============================================================
// ✅ التحقق من موقع الطلب
// ============================================================

async function validateOrderLocation(wilaya, commune) {

  const wilayaCode = resolveWilayaCode(wilaya);


  // الولاية غير موجودة
  if (!wilayaCode) {

    return {
      valid: false,

      reason: 'WILAYA_NOT_FOUND',

      message:
        `الولاية غير موجودة ضمن نظام 58 ولاية: ${wilaya}`
    };

  }


  // البحث عن البلدية
  const found = await findCommune(
    wilayaCode,
    commune
  );


  // البلدية غير موجودة
  if (!found) {

    return {
      valid: false,

      reason: 'COMMUNE_NOT_FOUND',

      message:
        `البلدية غير موجودة ضمن ولاية ${WILAYA_BY_CODE[wilayaCode].ar}: ${commune}`
    };

  }


  return {

    valid: true,

    wilaya:
      WILAYA_BY_CODE[wilayaCode],

    commune:
      found

  };

}


// ============================================================
// 🤖 تجهيز الموقع لبوت Sawa9ly
// ============================================================

async function resolveSawa9lyLocation(
  wilaya,
  commune
) {

  const result =
    await validateOrderLocation(
      wilaya,
      commune
    );


  if (!result.valid) {
    return result;
  }


  return {

    valid: true,

    wilayaCode:
      result.wilaya.code,

    wilayaAr:
      result.wilaya.ar,

    wilayaFr:
      result.wilaya.fr,

    communeAr:
      result.commune.ar,

    communeFr:
      result.commune.fr,

    commune:
      result.commune

  };

}


// ============================================================
// 🩺 فحص قاعدة البيانات
// ============================================================

async function healthCheck() {

  const communes =
    await loadCommunes();


  const counts = {};


  for (const c of communes) {

    counts[c.wilayaCode] =
      (counts[c.wilayaCode] || 0) + 1;

  }


  return {

    wilayas:
      WILAYAS_58.length,

    communes:
      communes.length,

    wilayasWithCommunes:
      Object.keys(counts).length,

    valid58Wilayas:
      WILAYAS_58.length === 58,

    valid1541Communes:
      communes.length === 1541,

    counts

  };

}


// ============================================================
// 📤 EXPORT
// ============================================================

module.exports = {

  WILAYAS_58,

  WILAYA_BY_CODE,

  WILAYA_BY_ID,

  COMMUNES_SOURCE,

  normalizeName,

  loadCommunes,

  getCommunes,

  resolveWilayaCode,

  findCommune,

  validateOrderLocation,

  resolveSawa9lyLocation,

  healthCheck

};
