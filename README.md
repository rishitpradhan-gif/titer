# Titer

[![Titer — working application preview](https://raw.githubusercontent.com/rishitpradhan-gif/rishitpradhan-gif/main/assets/titer-workbench.png)](https://rp-titer.vercel.app)

**[Open application ↗](https://rp-titer.vercel.app)** · [Portfolio case study](https://rishitpradhan.com/projects/titer/)

An assay endpoint comparison workbench and private keyed API. Titer normalizes concentration units, preserves censored bounds, and checks declared experimental context before calculating reference-relative concentration ratios.

**Public workbench:** https://rp-titer.vercel.app

The public site processes files in-browser. It does not host an authenticated assay API or issue hosted-service credentials. The downloadable Node service provides that API on your own machine. No paid APIs, external runtime packages or accounts are required.

## Run locally

Node 22 or later:

```sh
npm start
# http://127.0.0.1:4458
npm test
```

Download `public/titer-source.zip` from the site, unzip, and run those commands in its `titer` directory. The source ZIP excludes credentials and key stores. To recreate it: `npm run package` (Python 3 required).

## API keys

In a second terminal:

```sh
npm run key -- create notebook 30
npm run key -- list
npm run key -- revoke KEY_ID
```

`create` prints a `tt_...` token once. Save it securely, then set `TITER_API_KEY` in your client environment. Do not put secrets in committed notebooks. The label and expiry are written to stderr, the token to stdout. The `npm` wrapper also prints its normal script banner; to capture only the token use `node scripts/key.mjs create notebook 30`.

Each secret contains 256 random bits. Only SHA-256 token hashes are stored, in per-key files under `.titer/keys` with mode 0600 (directory 0700 on creation). Default expiry is 30 days; 1–365 allowed. Revocation deletes its record and takes effect on the next request. Keys do not belong to the public Vercel website. Do not publish the key directory. `TITER_KEY_DIR` can select a private persistent directory. Existing directory permissions are not changed by Titer.

The server binds only to `127.0.0.1`; TLS termination, multi-user administration, hosted accounts and distributed abuse controls are not included. Rate limit: 60 requests per minute per key per process. Rate state resets on restart. API requests and assay contents are not persisted or logged. Key metadata is persisted. If you adapt it for network hosting, deploy it behind appropriate HTTPS and access controls.

## Python client

```python
import json, os, urllib.request
with open('public/example.csv') as f:
    payload = json.dumps({'csv': f.read(), 'reference_index': 0}).encode()
request = urllib.request.Request(
    'http://127.0.0.1:4458/api/v1/analyze',
    data=payload,
    headers={'Content-Type': 'application/json',
             'Authorization': 'Bearer ' + os.environ['TITER_API_KEY']})
report = json.load(urllib.request.urlopen(request))
print(report['summary'])
```

Alternatively submit `records` (array of row objects) instead of `csv`. Exactly one is required. `reference_index` defaults to 0, is zero-based, and must address an existing record. OpenAPI: `public/openapi.json`.

Errors: 400 invalid body/shape/CSV; 401 missing, forged, expired or revoked key; 405 wrong method; 413 request over 512 KiB; 415 wrong content type; 429 per-key rate limit; 503 limiter capacity. Scientifically invalid rows remain in a successful report with `valid: false`, errors, and null normalized concentrations. A structurally invalid dataset fails the request.

## Input schema

CSV requires `id,compound,endpoint,value,unit`. Additional columns are preserved, up to 40 total. Each field is a string or number of at most 2,000 characters. Unique record IDs are mandatory for valid rows. See `public/example.csv` for a complete template.

| Field | Meaning |
| --- | --- |
| id, compound | Record ID and declared compound name/identifier |
| endpoint | IC50, EC50, Ki, Kd (case normalized) |
| relation | = (default), <, <=, >, >=; ≤ and ≥ accepted |
| value | Positive finite numeric concentration; scientific notation allowed |
| unit | M, mM, uM/µM/μM, nM, pM; or g/L, mg/mL, ug/mL, mg/L, ng/mL |
| mw_g_mol | Required for mass concentration; molecular weight of the measured species |
| target | Declared target/construct identifier |
| organism | Declared organism |
| system | Purified protein, cell system, etc. |
| protocol | Assay protocol/version; should encode readout, buffer and other relevant conditions |
| temperature_C, pH | Declared conditions |
| incubation_min | Declared assay duration in minutes |
| substrate_nM, enzyme_nM | Declared concentrations in nM |
| source | Citation, URL, dataset accession or provenance text |

Blank context means unknown. Exact `NA` is an explicit assertion that the field does not apply, including for numeric context fields. Titer does not establish that the assertion is appropriate. Numeric context canonicalizes 25.0 and 25; text comparisons trim surrounding whitespace but do not resolve synonyms or aliases. All nine context fields and endpoint must match before exact-value ratios are emitted. Both sides must be uncensored and valid. A compound identity match is not required, so compounds may be compared within the same declared assay context.

## Scientific contract

- Molar concentration = value × unit factor; mass input additionally divides g/L by supplied molecular weight in g/mol.
- `p = -log10(molar)`. This is a plotting coordinate, not an official pChEMBL value or an efficacy score.
- Censor inequalities reverse on the negative-log scale. `>10 µM` is `p < 5`; it is never treated as an exact endpoint.
- Fold = record concentration / reference concentration, only after the explicit context gate. It is not a universal “better” ranking.
- Matching reported fields is not proof of experimental equivalence. Protocol text may omit important conditions; aliases may cause false mismatches. No automatic IC50→Ki conversion, significance test, uncertainty estimate, replicate pooling, curve fitting or causal claim is made.
- Molecular identities, mass purity, salt/solvate forms and source claims are not verified. The fixture is synthetic, not measured data. The context gate is a conservative project rule, not a validated classifier.

References informing these distinctions:

- Assay Guidance Manual, [Validating Identity, Mass Purity and Enzymatic Purity of Enzyme Preparations](https://www.ncbi.nlm.nih.gov/books/NBK91995/): apparent potencies depend on conditions including substrate, protein and pH.
- ChEMBL [Assay and Activity Questions](https://chembl.gitbook.io/chembl-interface-documentation/frequently-asked-questions/chembl-data-questions): negative-log molar activity values and exact-relation eligibility. Titer does not implement ChEMBL curation.

## Reproducibility and privacy

One shared zero-dependency engine (`public/core.mjs`) runs in the browser and API. JSON exports retain working input records, originals per row, conversion factors, exclusions, engine version, reference index, and hashes. The browser exports a raw source-file SHA-256 and a separate `JSON.stringify(input_records)` working hash; edits do not overwrite the raw source hash. The API hashes the exact HTTP JSON request bytes. Hashes detect differences, not source authenticity. Engine release identity is a semantic version, not a cryptographic signature.

Browser state is in memory, with no localStorage, telemetry, remote analysis, or external fonts. Export before closing. Hosting still receives ordinary page requests. Browser CSV/working data is capped at 512 KiB and 500 rows; exported reports up to 8 MiB can be reimported when their extracted working records remain within 512 KiB. JSON imports recompute results rather than trusting imported report conclusions.

## Verification

`npm test`: deterministic scientific edge cases, a 52-case unit-invariance sweep, real HTTP requests, API/browser-engine parity, key expiry/revocation/forgery, and request/rate limits. `node tests/browser.cjs` additionally uses an installed Playwright and Google Chrome, with `TITER_URL` optionally selecting a deployed site. No dependency install is required to run the app or core/API tests.
