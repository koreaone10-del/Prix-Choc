# Prix-Choc FINAL SOLUTION v2

This package is built from the current supplied working repositories and contains only the files that must be replaced/added.

## Fixes included
- Product prices: existing automated products recalculated to `basePrice + 500 DA` immediately in `products.js`.
- Future syncs: `config.js`, workflow, and `generator.js` use the same 500 DA margin policy.
- Images: existing `products.js` gallery URLs are deduplicated by original image source and keep the highest-resolution variant; scraper also ranks full/large/zoom/srcset images and deduplicates Next/Image size variants.
- Store UI: final dark-emerald high-contrast theme, larger readable labels/prices/inputs/buttons, clearer product/order cards.
- Locations: stronger Arabic/French aliases including Annaba municipalities and Megarine.
- Bot: stronger fallback for Sawa9ly commune selector when the field has weak/missing labels.
- `pricing.js` is included in its original correct location: `automation/pricing.js`.

## IMPORTANT
Do NOT upload `.env` from your local machine to GitHub.

## Paths
- Prix-Choc/automation/config.js
- Prix-Choc/automation/pricing.js
- Prix-Choc/automation/scraper.js
- Prix-Choc/automation/generator.js
- Prix-Choc/.github/workflows/products-sync.yml
- Prix-Choc/index.html
- Prix-Choc/products.js
- Prix-Choc/locations.js
- prix-choc-bot/server.js
- prix-choc-bot/locations.js
