// كود التنقل الذكي (في Vercel)
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('p');
    
    const catalogView = document.getElementById('catalog-view'); // div يحوي واجهة المتجر
    const orderView = document.getElementById('order-view'); // div يحوي استمارة الطلب

    if (!productId || !storeData.products[productId]) {
        // 1. إذا كان الرابط الرئيسي (أو منتج غير موجود)، اعرض الكتالوج وأخفِ الاستمارة
        catalogView.style.display = 'block';
        if(orderView) orderView.style.display = 'none';
        
        // بناء الكتالوج آلياً من ملف products.js
        catalogView.innerHTML = '<h1 style="text-align:center;">مرحباً بك في متجر Prix Choc</h1><div class="products-grid"></div>';
        const grid = catalogView.querySelector('.products-grid');
        
        for (const [id, product] of Object.entries(storeData.products)) {
            grid.innerHTML += `
                <div class="product-card" onclick="window.location.href='?p=${id}'" style="cursor:pointer; border:1px solid #ccc; padding:10px; margin:10px; text-align:center;">
                    <img src="${product.image}" width="200" alt="${product.name}">
                    <h3>${product.name}</h3>
                    <p style="color:green; font-weight:bold;">${product.price} د.ج</p>
                    <button>اطلب الآن</button>
                </div>
            `;
        }
    } else {
        // 2. إذا كان الرابط يحتوي على منتج (مثل ?p=4)، اعرض استمارة الطلب وأخفِ الكتالوج
        if(catalogView) catalogView.style.display = 'none';
        orderView.style.display = 'block';
        
        const product = storeData.products[productId];
        
        // تعبئة معلومات الاستمارة آلياً
        document.getElementById('product-image').src = product.image;
        document.getElementById('product-name').innerText = product.name;
        document.getElementById('product-price').innerText = product.price + " د.ج";
        
        // سكريبت التوصيل والثمن النهائي (يُحسب آلياً بناءً على الولاية المختارة)
        const wilayaSelect = document.getElementById('wilaya-select');
        const finalPriceEl = document.getElementById('final-price');
        
        wilayaSelect.addEventListener('change', (e) => {
            const deliveryPrice = 700; // يمكنك ربطها بقائمة أسعار التوصيل الخاصة بك
            const finalTotal = product.price + deliveryPrice;
            finalPriceEl.innerText = finalTotal + " د.ج";
        });
    }
});
