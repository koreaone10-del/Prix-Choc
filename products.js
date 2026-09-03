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
    "4": { sawa9lyLink: "https://sawa9ly.app/product/6165", name: "Ensemble 3 PCS sac a dos Élégant et Imperméable pour Homme Avec Port USB Gris Mat-02 - طقم حقائب رجالية أنيقة 3 في 1 مع منفذ شحن", price: 2900, image: "https://sawa9ly.app/storage/76810/1786456637429_d2syf362_magnific_replace-color-of-3pcs-bag_afqe9jwfsh.jpg" },
    "5": { sawa9lyLink: "https://sawa9ly.app/product/6227", name:  " Sac à Dos Femme Antivol en Tissu Vintage avec Fermeture Arrière SACKDS39MR - حقيبة ظهر نسائية كاجوال متعددة الاستخدامات ", price: 2900, image: "https://sawa9ly.app/storage/77146/1787477177096_ser8fou1_1.jpg" },
    "6": { sawa9lyLink: "https://sawa9ly.app/product/6238", name: "Écouteurs Sans Fil Bluetooth TWS Q69 Design Mini Sac à Main Clip Ear Clip-On - سماعة بلوتوث لاسلكية بتصميم علبة حقيبة فاخرة", price: 3450, image: "https://sawa9ly.app/storage/77253/1787837589156_iwf8n5y0_1.jpg" },
    "7": { sawa9lyLink: "https://sawa9ly.app/product/6251", name: "Appareil de Massage et Ventouse Électrique Anti-Cellulite Aspiration Réglable 9 Niveaux - جهاز الحجامة والتدليك الكهربائي الذكي بالأشعة الحمراء", price: 2500, image: "https://sawa9ly.app/storage/77302/1788000090570_0vbrrfpa_1.webp" },
    "8": { sawa9lyLink: "https://sawa9ly.app/product/6242", name: "Sac à dos Tendance Pour Hommes en tissu Imperméable léger et respirant grande capacité SACHM08GR - حقيبة ظهر لحفظ الكمبيوتر المحمول والأعمال بتصميم عصري ومريح", price: 2450, image: "https://sawa9ly.app/storage/77265/1787825671028_34h9qjcq_1ce7e01169636134_sac-lianxi-7.jpg" },
    "9": { sawa9lyLink: "https://sawa9ly.app/product/5433", name: "Feu arrière clignotant triangulaire à LED multicolore 2PCS – مصباح إشارة متعدد الألوان", price: 5200, image: "https://sawa9ly.app/storage/65608/brake-lamp-cnc.jpg" },
    "10": { sawa9lyLink: "https://sawa9ly.app/product/2630", name: "Casque Moto avec Lunettes Amovibles Coloré Anti-Bouée", price: 1900, image: "https://sawaqli.fra1.cdn.digitaloceanspaces.com/23907/MASK-Moto-cnc.jpg" },
    
    "11": { sawa9lyLink: "https://sawa9ly.app/product/3394", name: "Système d’alarme antivol avec capteur de vibrations puissant de 110 dB", price: 3350, image: "https://sawaqli.fra1.cdn.digitaloceanspaces.com/34850/alarme-moto-bike-cnc.jpg" },
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
    "41": {
        name: "Produit : Adaptateur sans fil Android pour voiture Carplay et Android Auto - محول \"كاربلاي\" اللاسلكي 2 في 1",
        price: 5500,
        image: "https://sawa9ly.app/storage/70292/1774951652224_1027qk1e_wireless-adapter-carplay-cnc.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5724",
        basePrice: 4500,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T05:45:33.578Z"
    },
"42": {
        name: "Produit : Haut Parleur Bluetooth Urso Lotso-a3 mini sans fil V5.3 - مكبر صوت بلوتوث محمول",
        price: 3200,
        image: "https://sawa9ly.app/storage/70079/1774775958996_d7dfrydg_latso-a3-cnc.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5712",
        basePrice: 2200,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:34:18.699Z"
    },
"43": {
        name: "Produit : Haut Parleur Bluetooth Urso Lotso-a2 8W sans fil V5.3 - مكبر صوت بلوتوث محمول",
        price: 3200,
        image: "https://sawa9ly.app/storage/70071/1774774808454_0sc9zesy_d_nq_np_2x_792426-mlb75377811374_042024-f.webp",
        sawa9lyLink: "https://sawa9ly.app/product/5711",
        basePrice: 2200,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:34:52.194Z"
    },
"44": {
        name: "Produit : Pistolet de massage pour soulager la douleur 6 vitesses 4 têtes LM-810T - جهاز تدليك بعدة رِؤوس",
        price: 5650,
        image: "https://sawa9ly.app/storage/69478/massage-3head-cnc.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5685",
        basePrice: 4650,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:35:25.657Z"
    },
"45": {
        name: "Produit : Boite Chargeur Anker Zolo Original 20W USB-C - شاحن أصلي",
        price: 3250,
        image: "https://sawa9ly.app/storage/69330/anker-zelo-cnc.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5675",
        basePrice: 2250,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:35:59.145Z"
    },
"46": {
        name: "Produit : Porte-Manteau Mural Design Piano en Bois avec Touches Dorées - علاقة ملابس خشبية",
        price: 3800,
        image: "https://sawa9ly.app/storage/69201/porte-manteau-piano-3.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5665",
        basePrice: 2800,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:36:32.574Z"
    },
"47": {
        name: "Produit : Panier de rangement pour salle de bain en feutre tissé 4 compartiments – سلة تنظيم الأغراض في الحمام",
        price: 2500,
        image: "https://sawa9ly.app/storage/67197/8724-103-7.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5544",
        basePrice: 1500,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:37:39.554Z"
    },
"48": {
        name: "Produit : Lampe de table LED tactile rechargeable 3 couleurs design classique - مصباح ديكور بعدة درجات ضوئية",
        price: 3800,
        image: "https://sawa9ly.app/storage/66829/Lampe-RD-V2-CNC.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5522",
        basePrice: 2800,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:38:13.004Z"
    },
"49": {
        name: "Produit : Dentifrice blanchissant à la niacinamide UTOGRU Triple action blanchissante – معجون تبييض الأسنان",
        price: 3300,
        image: "https://sawa9ly.app/storage/66583/Utogru-5.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5497",
        basePrice: 2300,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:38:46.476Z"
    },
"50": {
        name: "Produit : Lampe d'Avertissement Multifonction avec Klaxon et Énergie Solaire Hurry Bolt HB-7139 - مصباح تحذيري متعدد الوظائف مع منبه وشحن بالطاقة الشمسية",
        price: 100999,
        image: "https://sawa9ly.app/storage/77412/1788340622756_wkavq1jx_1.png",
        sawa9lyLink: "https://sawa9ly.app/product/6269",
        basePrice: 99999,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:39:19.939Z"
    },
"51": {
        name: "Produit : Amplificateur Audio Voiture DSP 80W×4 Égaliseur EQ Sortie 4 Canaux Son HI-FI - مكبر صوت للسيارة عالي الجودة",
        price: 7200,
        image: "https://sawa9ly.app/storage/77404/1788271819567_g3wf06zi_0.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/6268",
        basePrice: 6200,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:39:53.438Z"
    },
"52": {
        name: "Produit : Aspirateur Sans Fil Portatif 4en1 Pour Voiture et Maison Suction 5000Pa - مكنسة لاسلكية محمولة للسيارة والمنزل 4 في 1",
        price: 3250,
        image: "https://sawa9ly.app/storage/77417/1788362750000_rs4nm80x_e9a2a58b-8e31-48e3-82de-2c13731f479e.png",
        sawa9lyLink: "https://sawa9ly.app/product/6267",
        basePrice: 2250,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:40:26.913Z"
    },
"53": {
        name: "Produit : Caméra de Recul HD Auto Angle 170° Étanche Assistance au Stationnement - كاميرا الروئية الخلفية للسيارة عالية الدقة",
        price: 3100,
        image: "https://sawa9ly.app/storage/77394/1788253703409_1zfauvhr_1.png",
        sawa9lyLink: "https://sawa9ly.app/product/6266",
        basePrice: 2100,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:41:00.407Z"
    },
"54": {
        name: "Produit : Kit de Pédicure et Manucure Élimination des Callosités Soin des Ongles et Pieds Doux - مجموعة العناية بالأظافر والقدمين المتكاملة",
        price: 2050,
        image: "https://sawa9ly.app/storage/77389/1788189220735_8cg22vab_0ef0a8db-10c7-4e61-b1bc-1a04f68bff8a.png",
        sawa9lyLink: "https://sawa9ly.app/product/6265",
        basePrice: 1050,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:41:33.879Z"
    },
"55": {
        name: "Produit : Masseur Oculaire Intelligent 12 Nœuds Compresses Chaudes et Froides Musique Intégrée - جهاز مساج العين الذكي مع خاصية التبريد والحرارة والموسيقى",
        price: 6250,
        image: "https://sawa9ly.app/storage/77388/1788185543002_g5e1c4mv_1.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/6264",
        basePrice: 5250,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:42:07.307Z"
    },
"56": {
        name: "Produit : Poêle et Marmite Électrique Multifonctionnelle 26cm Anti-Adhésif 3 Niveaux de Chauffe - مقلاة ووعاء الطهي الكهربائي متعدد الوظائف",
        price: 4850,
        image: "https://sawa9ly.app/storage/77384/1788181229050_20cuntlh_1.jpeg",
        sawa9lyLink: "https://sawa9ly.app/product/6263",
        basePrice: 3850,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:42:40.806Z"
    },
"57": {
        name: "Produit : Marmite Électrique Multifonctionnelle 1.8L Avec Panier Vapeur Anti-Adhésive - وعاء الطبخ الكهربائي المتعدد الوظائف بحجم 18 سم وسعة 1.8 لتر",
        price: 4250,
        image: "https://sawa9ly.app/storage/77379/1788171714019_nzaitr86_1.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/6262",
        basePrice: 3250,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:43:14.292Z"
    },
"58": {
        name: "Produit : Corde à Linge Rétractable Automatique 15m Fixation Murale Supporte 10kg - حبل غسيل ملابس أوتوماتيكي قابل للسحب بطول 15 متراً",
        price: 2900,
        image: "https://sawa9ly.app/storage/77374/1788166582086_56tmi14v_1.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/6261",
        basePrice: 1900,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:43:47.750Z"
    },
"59": {
        name: "Produit : Double Corde à Linge Rétractable Automatique 30m Fixation Murale 2 Lignes Indépendantes - حبل غسيل أوتوماتيكي مزدوج قابل للسحب بطول 30 متراً (15×2)",
        price: 4700,
        image: "https://sawa9ly.app/storage/77373/1788168764959_i0ohwjmc_1.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/6260",
        basePrice: 3700,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:44:21.314Z"
    },

    "60": {
        name: "Produit : Adaptateur sans fil Android pour voiture Carplay et Android Auto - محول \"كاربلاي\" اللاسلكي 2 في 1",
        price: 5500,
        image: "https://sawa9ly.app/storage/70292/1774951652224_1027qk1e_wireless-adapter-carplay-cnc.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5724",
        basePrice: 4500,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:33:45.186Z"
    },

    "61": {
        name: "Produit : Projecteur portable Full HD HY300 Mini Android 11 WiFi6 et Bluetooth 5.0 - جهاز عرض ذكي",
        price: 15500,
        image: "https://sawa9ly.app/storage/69128/hy320-mini-cnc.jpg",
        sawa9lyLink: "https://sawa9ly.app/product/5663",
        basePrice: 14500,
        profit: 1000,
        automated: true,
        updatedAt: "2026-09-03T09:37:06.069Z"
    },
};
