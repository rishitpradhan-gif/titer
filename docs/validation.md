# Release verification — 2026-11-14

## Executed

- Node 22.17.1: 18 core/API tests pass.
- 52 deterministic unit-invariance cases spanning molar values from 10^-12 through 9 M.
- A 500-record synthetic batch preserves row identity without pooling.
- HTTP tests execute real requests against the Node server, including valid authentication, missing/forged/expired/revoked keys, incorrect Bearer scheme, malformed JSON, schema rejection, rate limit and oversized input.
- HTTP output rows equal the shared engine's browser-eligible implementation on the synthetic fixture.
- Chrome: desktop 1500×1100 and mobile 390×844. Filters, reference changes, context mismatches, censored values, record edits, escaped source text, exported input hash, JSON report round trip, malformed import preservation, and documentation dialogs passed. Desktop/mobile screenshots inspected.
- Browser network capture showed only same-origin GET requests during the workbench workflow; no assay uploads or external requests.

The table and plot intentionally scroll horizontally on narrow screens. The plot scrolls vertically for large datasets. Browser checks use installed Playwright and Chrome; they are not runtime dependencies.

## Synthetic fixture findings

Nine input records: eight valid, one invalid mass conversion due to missing molecular weight. Five records match declared reference context (including the reference), two differ, one lacks context, and one is invalid. One valid record is a censored bound. It remains in the plot but receives no exact-value fold ratio. These are deliberately constructed edge cases, not measured performance on a real assay dataset.

## Limits

No human study, physical experiment, third-party validation cohort, clinical validation, or real assay-source verification. Matching fields do not prove equivalence. The context classifier is an explicit engineering policy. Text aliases and omitted details within protocol labels can mislead. No potency/efficacy ranking, uncertainty model, significance test, curve fitting or automatic endpoint interchange is provided.

API security tests cover the included loopback service; this is not an externally audited multi-tenant authentication platform. Per-key rate state is in-process. Existing key-directory permissions are not changed. Keys and assay data are excluded from downloadable source.
