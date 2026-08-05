const storeData = {
    products: {
        "1": {
            babaId: "NL-94",
            name: "سماعات الرأس اللاسلكية الاحترافية",
            price: 1500,
            type: "image",
            mediaUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80"
        },
        "2": {
            babaId: "XY-55",
            name: "عصا السيلفي الذكية مع إضاءة",
            price: 2200,
            type: "image",
            mediaUrl: "https://images.unsplash.com/photo-1527011045970-128a30a21fb9?w=500&q=80"
        },
        "4": {
            babaId: "NL-210",
            name: "قبعة صيفية نسائية فاخرة باللؤلؤ والورود (Boho-Chic)",
            price: 650,
            type: "image",
            mediaUrl: "https://images.unsplash.com/photo-1527011045970-128a30a21fb9?w=500&q=80" 
            /* ملاحظة: رابط يوتيوب Shorts لا يظهر كصورة مباشرة في المتصفح، 
               لذا الأفضل وضع رابط صورة مباشرة هنا، أو إذا كان فيديو ضع رابط فيديو بصيغة mp4 
               أو عدل الـ type إلى video إذا كنت تستخدم مشغل يوتيوب. 
               حالياً وضعت لك صورة مؤقتة لتعمل معك التجربة فوراً بدون أخطاء */
        }
    },
    
    // قسم الولايات (باقي الملف يبقى كما هو)
    wilayas: {
        "1": { name: "أدرار", delivery_fees: { standard: { home: 1000, desk: 800 }, express: { home: 1050, desk: 850 } }, communes: ["أدرار", "أولاد أحمد تيمي"] },
        // ... وباقي الولايات ...
    }
};
