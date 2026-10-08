# Local multi-make dataset

Prepared from https://github.com/gor3a/vehicle-makes-models at commit
`ee99776470a45214bf524cdfe22e5dbf4bd67f93`. Upstream credits
https://www.autoevolution.com/ for vehicle facts. Dataset license: ODbL-1.0;
the upstream attribution/license notice is retained in `local/LICENSE-DATA.txt`.
No vehicle values were changed. Each group has `enrichmentProvenance` with the
source URL, revision, retrieval/preparation timestamps and input SHA-256.
The provider currently ignores this added metadata; its rawReference retains
the dataset name and group. Preparation never downloads anything.

## Exact provider schema

Root: a group object or an array of group objects (not `{data: [...]}`).

```text
group: string
makes: array
  name: string
  models: array
    name: string
    yearStart: number|null
    generations: optional array
      name: string|null
      yearStart: number|null
      yearEnd: number|null
      bodyType: string|null
      engines: optional array
        label: string|null
        displacementCc: number|null
        cylinders: number|null
        fuelType: string|null
        drivetrain: string|null
```

Missing/empty generations or engines use an empty placeholder so model-only
records remain candidates. yearStart uses generation.yearStart, falling back
to model.yearStart. yearEnd uses generation.yearEnd only; model.yearEnd is
currently ignored. Other absent values become null. Every engine yields a
candidate; this does not mean every candidate is a distinct vehicle.
Additional source fields (including specs) are preserved in the local file
but ignored by the provider. Matching uses case/whitespace-normalized exact
make/model names, not aliases. No provider changes were required.

## Files and use

`local/vehicle-makes-models.json` is the prepared 51 MB local input, excluded
from Git by the existing local-directory ignore. `local/upstream-all.json`
is its source. `local/upstream-source.json` pins provenance.
`local/dataset-coverage.json` records model names and sample lookup counts.
No runtime download or environment-path lookup is involved.

```powershell
node --env-file=.env .\scripts\test-enrichment.js .\backup-test.json .\tooling\enrichment\local\vehicle-makes-models.json --limit=20
```

Add `--offline` to disable NHTSA and CarAPI as well. The command above was not
run against the user's backup during preparation. Local provider lookups and
unit tests were used instead. To prepare another file offline (output must
not already exist):

```powershell
node tooling/enrichment/prepare-dataset.js tooling/enrichment/local/upstream-all.json tooling/enrichment/local/upstream-source.json tooling/enrichment/local/another-dataset.json
```

## Measured coverage

164 makes, 2649 models, 30745 provider candidates. Successful sample lookups:
BMW / 1 Series (237 candidates), Audi / 100 (5), Toyota / 4Runner (17),
Changan / Alsvin (1). Models per make: BMW 65, Audi 78, Toyota 69, Changan 12,
BYD 5, Jetour 4, Geely 6, Chery 3. Chinese coverage is partial: Changan S07,
BYD Song Plus and BYD QIN PLUS are absent under those exact make/model names.
Changan Eado and Jetour T2 exist. No aliases or missing facts were invented.

66 tests passed. Existing HTTP tests exercise Clear cache and consequently
cleared the contents of local/nhtsa-cache.json; the file still exists. Toyota
JSON was neither replaced nor deleted. No Firebase, deploy, commit or push.
