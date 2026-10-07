# vulgr.tech

The project website: plain HTML, CSS and JavaScript, no build step. `.github/workflows/pages.yml` publishes this folder to GitHub Pages on every push to `master` that touches it.

The images (`assets/screenshot.png`, `assets/favicon.png`, `assets/logo.png`) are copied from `docs/` and `ui/public/` during deployment. To preview locally:

```bash
mkdir -p docs-site/assets && cp docs/screenshot.png ui/public/favicon.png ui/public/logo.png docs-site/assets/
npx serve docs-site
```
