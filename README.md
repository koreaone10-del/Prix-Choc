# Prix Choc — Phase 2

Cette archive contient les fichiers complets à remplacer dans le dépôt GitHub.

## Fichiers
- `automation/discover.js` — découverte complète et état persistant des produits absents.
- `automation/scraper.js` — scraper corrigé avec galerie d'images et scraping des nouveaux produits.
- `automation/generator.js` — génération/restauration et gestion sûre de `available`.
- `.github/workflows/products-sync.yml` — sauvegarde de l'état persistant dans Git.

## Important
Ne modifiez pas des lignes à l'intérieur des fichiers. Remplacez les fichiers complets.

Le fichier d'état persistant sera créé automatiquement ici :
`automation/state/discovery-history.json`

Le workflow le commit explicitement avec `products.js`, sans utiliser `git add .`.

## Logique disponibilité
- Une absence lors d'un seul scan ne désactive pas le produit.
- Après deux scans réussis consécutifs où le produit reste absent, il peut devenir `available: false`.
- Si son identifiant Sawa9ly réapparaît, le produit est restauré automatiquement à `available: true`.
- Les produits manuels ne sont pas désactivés par cette logique.

## Vérifications effectuées avant livraison
- `node --check automation/discover.js` OK
- `node --check automation/scraper.js` OK
- `node --check automation/generator.js` OK
- YAML du workflow analysé sans erreur de syntaxe.
