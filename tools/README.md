# Site data tools

These scripts build `public-finance/data/` from a checkout of the data repository
(`xKDR/india-public-finance-portal`). They read the additive-leaf NDJSON and the validation
summaries. They do not change the data repository.

## State table

`states.mjs` has one row per state: site key, file prefix, package folder, amount unit, crore
divisor, leaf level and its label, leaf rule, source-page key, and the native name. To add a
state, add a row here, then add its Explore tab in `../explore.html`.

## Rebuild

Run from the site repository root. `--data` is the data repository checkout.

```sh
node tools/build-local-data.mjs --data ../india-public-finance-portal   # all states
node tools/build-local-data.mjs --data ../india-public-finance-portal --only br,mh
node tools/prepare-preview.mjs --data ../india-public-finance-portal
node tools/make-state-pages.mjs        # only when a state is added
```

`--only` rebuilds the named states and keeps the other states' entries.
`prepare-preview.mjs` always rebuilds `compare/index.json` and the pass rates for every state.

## Check

```sh
node tools/verify-preview.mjs
node tools/verify-compare.mjs
node tools/verify-selected-heads.mjs --data ../india-public-finance-portal
node tools/serve-preview.mjs           # http://127.0.0.1:4180/public-finance/
node tools/check-pages.mjs             # with the preview server running
```

## Origin

`build-local-data.mjs`, `prepare-preview.mjs`, `serve-preview.mjs`, `verify-preview.mjs`,
`verify-compare.mjs`, `verify-selected-heads.mjs` and `schema-index.json` are recovered build
scripts. They were copied from a local recovery workspace (`~/scratch/ipfp-deploy/src/`) on
11 November 2026. Changes from the recovered copies:

- Paths: the site root is this repository (not `local-site/`); the data repository is `--data`.
- The hardcoded Karnataka and Tamil Nadu lists became `states.mjs`. Units, crore divisors, leaf
  level and labels come from the table. The build stops if a leaf row has another `amount_unit`.
- `schema-tn-index.json` is not copied: it differed from `schema-index.json` only in the leaf
  label, which is now `leaf_label`.
- A source PDF is linked only when the data repository holds the file.
- `prepare-preview.mjs` no longer rewrites HTML. The Site navigation change is already in the
  pages, and the preview banner was removed on purpose.
- `provenance.json` gains `states.<st>`: the last data-repository commit that changed each
  package, its unit and its leaf rule.

With these changes, Karnataka and Tamil Nadu output is byte-identical to the files built by the
recovered scripts.
