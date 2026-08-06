// ملف products.js
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
            // بدلاً من هذا:
            babaId: "NL-210"

            // اجعله هكذا (رقم المنتج من الرابط الذي أرسلته):
            babaId: "323" 
            // أو يمكنك وضع الرابط كاملاً وسيفهمه البوت:
            // babaId: "https://www.babaalgeria.com/product/323"
            type: "image",
            mediaUrl: "https://www.babaalgeria.com/uploads/products/product_6a2fe1a9add40.jpg"
        }
    }
};
