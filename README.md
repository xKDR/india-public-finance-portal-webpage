# India Public Finance Portal

This directory is the static deployment artifact for the India Public Finance research preview.

## Publish

1. Upload the contents of this directory to a static HTTPS host.
2. Use `index.html` as the public landing page.
3. Link the state application at `public-finance/index.html`.
4. Keep the directory structure unchanged. The pages load data and scripts from relative paths.

For a local check, serve this directory over HTTP. Do not open the pages with `file://`; browser
module and data requests need an HTTP origin.

The portal currently includes Karnataka FY 2018-19 to 2026-27 and Tamil Nadu FY 2014-15 to
2026-27. It is a research preview. Read `public-finance/about.html` and the linked package notes
before using a figure in published analysis.
