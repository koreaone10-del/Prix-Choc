# Prix Choc — Automation Phase 1

Files in this package replace these files in the repository:

- automation/scraper.js
- automation/discover.js
- automation/generator.js

## What is included

1. scraper.js: repaired image extraction, multiple images, new-products-only scraping, existing price parser preserved.
2. discover.js: full discovery report, stale-output protection, non-empty/full-page validation, two-successful-scan confirmation for missing products.
3. generator.js: availability is based on the verified discovery catalog rather than requiring every existing product to be scraped; unavailable products can be restored when discovered again.

## Important

Do not manually delete sections from these files. Replace the complete files.

Validation performed before packaging:
- node --check automation/scraper.js
- node --check automation/discover.js
- node --check automation/generator.js

No changes were made to wilayasData or the existing price parsing logic.

