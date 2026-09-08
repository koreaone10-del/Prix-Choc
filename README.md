# Prix-Choc — Corrected Final Files

Built from the current working files supplied for this correction, not from the older `scraper(1).js` / `scraper(2).js` candidates.

## Included
- Prix-Choc/automation/scraper.js — image-quality candidate ranking and srcset handling.
- Prix-Choc/index.html — visual palette cleanup only; order/product structure preserved.
- Prix-Choc/locations.js — canonical commune aliases including Megarine.
- prix-choc-bot/server.js — safer commune selector fallback + normalized/fuzzy option matching while preserving successful direct matching.
- prix-choc-bot/locations.js — same location mapping used by the bot.

## Validation performed
- Node syntax check: scraper.js PASS
- Node syntax check: server.js PASS
- Node syntax check: both locations.js files PASS
- HTML structure sanity: PASS (balanced script/style tags; final visual style is inside head)
- Explicit Arabic/French mapping test: المقارين -> Megarine PASS

## Important
This package is designed to fix the identified code-level causes. A literal 100% guarantee of live Sawa9ly order success cannot be honestly given without deploying these files to the live Render/GitHub environment and executing real orders against Sawa9ly. The code deliberately keeps the existing successful direct-selection path and only adds fallback behavior for cases that previously failed.
