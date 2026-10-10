# SDD ledger — plan: ../painel/docs/superpowers/plans/2026-10-10-mapas-tematicos.md

Spec approved and plan approved for inline execution on 10/10/2026. Base: 1daa8b10b94b56bd5d915358dac77ad1f70f47ed. Worktree: expansao/mapas-piloto, branch codex/mapas-tematicos.

Pre-flight 1→2: GeoJSON and metadata produced by Task 1 feed catalogue validation in Task 2; no conflict.
Pre-flight 2→3: theme-model.mjs and catalogue schema feed renderer and viewer; no conflict.
Pre-flight 3→4: buildPortal compatibility and generated routes feed local preview; no conflict.
Setup: native worktree tool could not operate from the non-Git workspace root; created the approved worktree with git in the portal repository. Bash skill helpers require elevation on this Windows sandbox. Existing portal baseline: 4/4 passed using local TEMP.

Task 1: in progress. Verify source integrity, GDAL reprojection and counts before UI work.
Task 1: complete (commits 1daa8b1..71af0f4, tests: node --test tests/maps-data.test.mjs tests/portal.test.mjs → ℹ duration_ms 924.6161)
Task 2: Ruling: add .gitattributes for derived JSON/GeoJSON and vendored assets — prevents Windows newline conversion invalidating recorded hashes — cost if wrong: adjust text attributes and regenerate derived hashes.
Task 2: complete (commits 71af0f4..8ccb6f4, tests: node --test tests/maps-model.test.mjs tests/maps-data.test.mjs tests/portal.test.mjs → ℹ duration_ms 873.6248)
Task 3: Ruling: renderMapsPage accepts optional themeBundles in addition to catalogue/basePath — server-rendered list and metadata need the prepared datasets, absent from the original signature — cost if wrong: adapt one renderer call while preserving the catalogue interface.
Task 3: complete (commits 8ccb6f4..b7792c5, tests: node --test tests/maps-page.test.mjs tests/maps-model.test.mjs tests/maps-data.test.mjs tests/portal.test.mjs → ℹ duration_ms 1022.6683)
Task 4: Ruling: emit public JavaScript as .js and GeoJSON as .json, license/source map as JSON containers — existing publication whitelist rejects .mjs/.geojson/LICENSE/.map; preserve policy and geographic bytes instead of changing publisher — cost if wrong: adjust generated filenames and download labels, sources remain intact.
Task 4: complete (commits b7792c5..f0f9830, tests: node --test tests/maps-data.test.mjs tests/maps-model.test.mjs tests/maps-page.test.mjs tests/maps-integration.test.mjs tests/portal.test.mjs → ℹ duration_ms 1210.3634)

Final review: independent read-only reviewer on f0f9830; no Critical findings; six Important findings and one source attribution/text issue regraded Important by its effect on interpretation.
Final: fixed partial-list loss and stale-theme metadata — falhas parciais conservam o conjunto documental and fallback de cada tema RED→GREEN, suite 24/24; browser confirms 32 list/27 markers and own B period.
Final: fixed geometry structure and marker geometry restrictions — estrutura geométrica inválida RED→GREEN, suite 24/24.
Final: fixed cross-file duplicate codes — códigos são únicos em todos os arquivos RED→GREEN, suite 24/24.
Final: fixed interrupted preparation and unchecked declared provenance — falha durante nova preparação and provas declaradas divergentes RED→GREEN, suite 24/24.
Final: fixed uncovered numeric values falsely marked missing — valor numérico fora das classes RED→GREEN, suite 24/24.
Final: fixed source attribution and territorial texts — atribuição usa as fontes do tema RED→GREEN, suite 24/24.
Final: Ruling: external validation of service operation, address accuracy and team coverage stays outside this implementation — users receive source dates and explicit limits rather than a current-operation claim — cost if wrong: obtain institutional validation and update the layers.
Final: Ruling: raster, heat maps and time series remain deferred — approved release supports vector themes and clearly records this boundary — cost if wrong: implement additional data formats and viewer features.
Final: Ruling: no production-hosting or domain changes — approved scope is a local reviewable preview and the publisher compatibility was checked — cost if wrong: generate external homologation and verify the authorized publication.
Final: Ruling: the independent reviewer did not repeat browser QA — implementer exercised the interface and saved evidence; reviewer checked code and evidence — cost if wrong: perform another interface verification.
Final: Ruling: no full internal Leaflet audit — official release, version, license, hashes and integration were checked — cost if wrong: update or patch the library and rerun affected checks.
Final: no deferred minors. Corrections made in one pass; suite 24/24; original panel and portal checkouts remain clean.
