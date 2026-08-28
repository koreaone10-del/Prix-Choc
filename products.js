const storeData = {
    // ==========================================
    // المنتج الأول (النشط) - الرابط: ?p=1
    // ==========================================
    "1": {
        sawa9lyLink: "https://sawa9ly.app/product/6067", 
        name: "عصّارة فواكه وخضروات محمولة بمحرك عالي السرعة",
        price: 4200, 
        image: "https://sawa9ly.app/storage/76169/1784994778523_4rrz6dw6_1.jpg"
    },

    // ==========================================
    // القوالب الجاهزة (قم بتعديل محتوى الأقواس فقط)
    // ==========================================
    "2": { sawa9lyLink: "https://sawa9ly.app/product/5859", name: "🎧 سماعات Monster Aura Fit GT29: تكنولوجيا 2026 بين يديك! 🚀", price:4400, image: "https://pub-bfdc1913c5ba4512972387b8d080956f.r2.dev/products/images/1778319662172_easqnrv5_5c02e728205d383d7d0175aca07a4fff.jpg_720x720q80.jpg_.webp" },
    "3": { sawa9lyLink: "https://sawa9ly.app/product/5663", name: "Projecteur portable Full HD HY320 Mini Android 11 WiFi6 et Bluetooth 5.0 - جهاز عرض ذكي", price: 15200, image: "https://pub-bfdc1913c5ba4512972387b8d080956f.r2.dev/products/images/1772364019890_vqn7q4p7_hy320-mini-1.jpg" },
    "4": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 4", price: 0, image: "رابط_الصورة" },
    "5": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 5", price: 0, image: "رابط_الصورة" },
    "6": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 6", price: 0, image: "رابط_الصورة" },
    "7": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 7", price: 0, image: "رابط_الصورة" },
    "8": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 8", price: 0, image: "رابط_الصورة" },
    "9": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 9", price: 0, image: "رابط_الصورة" },
    "10": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 10", price: 0, image: "رابط_الصورة" },
    
    "11": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 11", price: 0, image: "رابط_الصورة" },
    "12": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 12", price: 0, image: "رابط_الصورة" },
    "13": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 13", price: 0, image: "رابط_الصورة" },
    "14": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 14", price: 0, image: "رابط_الصورة" },
    "15": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 15", price: 0, image: "رابط_الصورة" },
    "16": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 16", price: 0, image: "رابط_الصورة" },
    "17": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 17", price: 0, image: "رابط_الصورة" },
    "18": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 18", price: 0, image: "رابط_الصورة" },
    "19": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 19", price: 0, image: "رابط_الصورة" },
    "20": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 20", price: 0, image: "رابط_الصورة" },

    "21": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 21", price: 0, image: "رابط_الصورة" },
    "22": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 22", price: 0, image: "رابط_الصورة" },
    "23": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 23", price: 0, image: "رابط_الصورة" },
    "24": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 24", price: 0, image: "رابط_الصورة" },
    "25": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 25", price: 0, image: "رابط_الصورة" },
    "26": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 26", price: 0, image: "رابط_الصورة" },
    "27": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 27", price: 0, image: "رابط_الصورة" },
    "28": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 28", price: 0, image: "رابط_الصورة" },
    "29": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 29", price: 0, image: "رابط_الصورة" },
    "30": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 30", price: 0, image: "رابط_الصورة" },

    "31": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 31", price: 0, image: "رابط_الصورة" },
    "32": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 32", price: 0, image: "رابط_الصورة" },
    "33": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 33", price: 0, image: "رابط_الصورة" },
    "34": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 34", price: 0, image: "رابط_الصورة" },
    "35": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 35", price: 0, image: "رابط_الصورة" },
    "36": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 36", price: 0, image: "رابط_الصورة" },
    "37": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 37", price: 0, image: "رابط_الصورة" },
    "38": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 38", price: 0, image: "رابط_الصورة" },
    "39": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 39", price: 0, image: "رابط_الصورة" },
    "40": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 40", price: 0, image: "رابط_الصورة" },
    "41": { sawa9lyLink: "رابط_سوقلي", name: "اسم المنتج 41", price: 0, image: "رابط_الصورة" }
};
const babaData = {
    "RS-28": {
        provider: "Baba Algeria",
        code: "RS-28",
        babaLink: "https://www.babaalgeria.com/product/176",
        orderLink: "https://www.babaalgeria.com/create-order",
        name: "ساعة رويال آيس الفضية – قمة الفخامة المرصعة ببريق الألماس",
        price: 550,
        image: "https://www.babaalgeria.com/uploads/products/product_69727d30c9b33.jpg"
    }
};
