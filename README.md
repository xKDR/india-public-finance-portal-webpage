# India Public Finance Lab

This repository is the static website for the India Public Finance Lab. The live site is
https://india-public-finance.pages.dev.

The site includes Karnataka FY 2018-19 to 2026-27 and Tamil Nadu FY 2014-15 to 2026-27. It is a
research preview. Read `public-finance/about.html` before you use a figure in published analysis.

## Layout

- `index.html` is the landing page.
- `public-finance/` holds the state pages: explorer, dashboard and time series for each state
  (`ka/`, `tn/`), plus Compare, About and Report.
- `public-finance/data/` holds the data files that the pages load.
- `resources/` holds the Guide and Results pages.

Keep the directory structure unchanged. The pages load data and scripts from relative paths.

## Local check

Serve this directory over HTTP, for example with `python3 -m http.server`. Do not open the pages
with `file://`, because module and data requests need an HTTP origin.

## Publish

The site is a Cloudflare Pages project, `india-public-finance`, with no Git connection. A push to
GitHub does not deploy it. To deploy, commit and push your change, then run this from the
repository root:

```sh
wrangler pages deploy . --project-name india-public-finance --branch main \
  --commit-hash "$(git rev-parse HEAD)" --commit-message "$(git log -1 --format=%s)" \
  --commit-dirty=false
```

Run `wrangler login` first if you are not logged in.
