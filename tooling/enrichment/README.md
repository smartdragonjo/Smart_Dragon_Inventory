# Local vehicle enrichment prototype

Branch: `feature/vehicle-enrichment-prototype`. Node 24 tested; no dependencies.
Nothing is deployed, pushed, imported, or written to Firebase. This directory is
server-side tooling, not a public-site bundle. Only the three explicitly listed
prototype assets are served. Never serve the entire repository to expose tooling
or environment files. The server binds only to `127.0.0.1:8787` and rejects foreign
origins/Host headers. Stop it with Ctrl+C.

## Local use

From the repository root:

```powershell
node --test tooling/enrichment/tests/*.test.*
node tooling/enrichment/server.js --offline
```

Open `http://127.0.0.1:8787/prototype/enrichment.html`. Load your backup JSON using
the file picker, select an incomplete vehicle, and click Run lookup. For a fully
offline smoke test use `tooling/enrichment/fixtures/vehicles.json`. This fixture is
synthetic, based on the requested name examples, **not** a production snapshot.
The named `smart-dragon-vehicles-backup-2026-10-06_15-27-34.json` was not available
in the supplied attachment or workspace. The existing `data/vehicles.json` is a
separate older local file; it is not substituted for the missing snapshot.

With a locally downloaded dataset and real NHTSA lookups enabled:

```powershell
node tooling/enrichment/server.js tooling/enrichment/local/toyota.json
node scripts/test-enrichment.js tooling/enrichment/fixtures/vehicles.json tooling/enrichment/local/toyota.json --offline --limit=10
node scripts/test-enrichment.js "PATH-TO-YOUR-BACKUP.json" tooling/enrichment/local/toyota.json --limit=10
```

The first positional CLI argument is a backup array, with either `{vehicle,
source, fitments}` records or flat vehicle objects. Status or dataQuality must
explicitly equal `incomplete`; source.dataQuality supports existing backup exports.
No missing-status inference is performed. Complete records are excluded.
Batch limit defaults to 10 and is hard-capped at 20; requests are sequential.
Generated report: `reports/enrichment-prototype.json` (ignored).
NHTSA make-response cache: `tooling/enrichment/local/nhtsa-cache.json` (ignored,
24-hour TTL). Clear cache clears this cache only. Empty matches are cached too.

## Dataset provenance and API contracts

- [vehicle-makes-models](https://github.com/gor3a/vehicle-makes-models): consume
  its nested per-make JSON, or merged `all.json`, through LocalDatasetProvider.
  Data is ODbL-1.0; code is MIT. Preserve upstream attribution/license when
  redistributing data or derived datasets. No upstream data is committed here.
  Per-make JSON avoids introducing a large dataset into the public application.
  Downloaded test file: `https://raw.githubusercontent.com/gor3a/vehicle-makes-models/main/data/json/toyota.json`.
  Other makes require their corresponding group files or `all.json`; the Toyota
  file alone cannot establish global coverage. Source data is candidate evidence.
- [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/): GetModelsForMake with exact
  normalized matching, 10-second timeout, at least one second between requests,
  one retry for 429/5xx, bounded Retry-After handling. No global crawl. This
  endpoint establishes make/model only, never production years or engine specs.
- [CarAPI authentication](https://carapi.app/docs/api/auth/) and
  [trims v2](https://carapi.app/docs/api/trims/): server-side token/secret login,
  in-memory bearer token, 10-second timeouts, one bounded page of trim candidates.
  Results are marked partial; this is not an exhaustive trim search. Missing keys,
  unknown year, or a year outside 2015–2020 skip requests. Credentials were not
  supplied and live authenticated access was not tested. Adapter contract is tested
  with synthetic responses. Set `CARAPI_TOKEN` and `CARAPI_SECRET` in the process
  environment, or use Node's `--env-file=.env`; never put them in browser code.

## Interpretation and data protection

Automatic matching uses only NHTSA, CarAPI and Local Dataset. Vehicles without
a suitable match require manual review; this is an expected outcome, not a failure.

Normalization keeps original names unchanged and logs transformations. Trailing
standalone years 1950–2100 become hints; 525, 6 and Model 3 remain model names.
The engine never modifies its input or includes fitment fields in proposals.
Existing nonempty fields are preserved regardless of provenance, a conservative
implementation of manual > approved external > candidate external when legacy
backups do not preserve provenance. External alternatives/conflicts remain visible.
No merge/save/publish/approve endpoint exists.

Each field includes source, confidence, alternatives, conflicts and a protection
flag. Confidence is a heuristic, not a calibrated probability. Duplicate variants
from one provider do not count as independent corroboration. Distinct alternatives
remain unresolved (null); existing values stay visible even with conflicts. Engine
displacement is cc. Unknown end years remain null, not today's year. Matching is
exact after whitespace/case normalization; aliases/fuzzy matching are deferred.

Future oil fields can extend the explicit identity field registry and provider
adapters after a separate review. No oil or fitment category is added now. Any
future approximate oil recommendation needs an explicit type and user warning.

## Verification and remaining work

- 20 isolated tests passed, including the actual backup export function with a
  read-only fake database, normalization, provider isolation, conflicts, credentials,
  local HTTP load/lookup/cache flow and origin/file-serving restrictions.
- Live NHTSA lookup succeeded for Toyota Corolla drawn from `data/vehicles.json`:
  makeId 448, modelId 2208. No Firebase SDK or service was used.
- Offline batch: 10 synthetic incomplete vehicles; Toyota dataset matched 2;
  8 had no match. This measures plumbing, not production accuracy.
- Existing `scripts/test_firestore.cjs`: 1 passed, 7 failed, both before and after
  the change. Its mock lacks the named Firebase app configuration now required by
  production code. Baseline was checked using `git show HEAD:js/firebase/firestore.js`
  in memory, without replacing working files. Fixing that old harness is outside
  this prototype's scope.
- TODO: run batch against the missing dated backup when it becomes available;
  assess coverage for all desired dataset groups; validate real CarAPI credentials;
  perform an interactive browser review (HTTP flow has automated coverage).
- No deployment, push, migration, auth/rules change, Search App sync change or
  Firebase read/write occurred. Only the two null guards change production code.

## Changed files

Existing: `.env.example`, `.gitignore`, `js/firebase/firestore.js` (two null guards).

New:

```text
prototype/enrichment.html
prototype/enrichment.css
prototype/enrichment.js
scripts/test-enrichment.js
tooling/enrichment/package.json
tooling/enrichment/vehicle-normalizer.js
tooling/enrichment/confidence.js
tooling/enrichment/enrichment-engine.js
tooling/enrichment/runtime.js
tooling/enrichment/server.js
tooling/enrichment/providers/nhtsa-provider.js
tooling/enrichment/providers/local-dataset-provider.js
tooling/enrichment/providers/carapi-provider.js
tooling/enrichment/fixtures/vehicles.json
tooling/enrichment/tests/backup.test.cjs
tooling/enrichment/tests/enrichment.test.js
tooling/enrichment/tests/server.test.js
tooling/enrichment/README.md
```

The full tracked + untracked patch is generated locally at
`reports/enrichment-prototype.diff`; regular `git diff` shows tracked changes only
until new files are staged. No commit/staging is needed to run this prototype.
