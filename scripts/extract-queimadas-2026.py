"""Stream monthly INPE Brazil CSVs and retain only Unaí AQUA_M-T detections.

Example from the repository root:
    python scripts/extract-queimadas-2026.py --months 202610

No national CSV is saved. The municipal subset and a local row-count manifest
are atomically replaced under .sources/queimadas.
"""

import argparse
import csv
from datetime import datetime
import io
import json
import os
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".sources" / "queimadas"
BASE_URL = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/"
SUBSET = SOURCE / "focos-2026-unai-satref.geojson"
MANIFEST = SOURCE / "focos-2026-extraction.json"
MUNICIPALITY_CODE = "3170404"
REFERENCE_SATELLITE = "AQUA_M-T"


def atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(payload, stream, ensure_ascii=False, separators=(",", ":"))
        stream.write("\n")
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--months", nargs="+", required=True, help="Mês(es) no formato AAAAMM; usa o CSV mensal oficial do Brasil")
    args = parser.parse_args()
    requested = sorted(set(args.months))
    for period in requested:
        if len(period) != 6 or not period.isdigit() or not 1 <= int(period[4:]) <= 12:
            parser.error("mês inválido: " + period)
        if period[:4] != "2026":
            parser.error("este extrator está limitado à série parcial de 2026")

    SOURCE.mkdir(parents=True, exist_ok=True)
    old = json.loads(SUBSET.read_text(encoding="utf-8")) if SUBSET.exists() else {"type": "FeatureCollection", "features": []}
    kept = [feature for feature in old.get("features", []) if str(feature.get("properties", {}).get("data_hora_gmt", "")).replace("-", "")[:6] not in requested]
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {
        "source": "INPE CSV mensal do Brasil",
        "municipalityCode": int(MUNICIPALITY_CODE),
        "satellite": REFERENCE_SATELLITE,
        "totals": [],
    }
    totals = {item["period"].replace("-", ""): item for item in manifest.get("totals", [])}

    for period in requested:
        filename = f"focos_mensal_br_{period}.csv"
        request = Request(BASE_URL + filename, headers={"User-Agent": "SalaSituacaoUnaí/1.0 (dados abertos INPE)"})
        source_rows = 0
        subset_rows = []
        with urlopen(request, timeout=120) as response:
            text = io.TextIOWrapper(response, encoding="utf-8-sig", newline="")
            for row in csv.DictReader(text):
                source_rows += 1
                if str(row.get("municipio_id", "")).strip() != MUNICIPALITY_CODE or str(row.get("satelite", "")).strip() != REFERENCE_SATELLITE:
                    continue
                try:
                    longitude = float(str(row["lon"]).strip())
                    latitude = float(str(row["lat"]).strip())
                except (KeyError, TypeError, ValueError):
                    continue
                properties = {
                    "foco_id": str(row.get("id", "")).strip(),
                    "data_hora_gmt": str(row.get("data_hora_gmt", "")).strip(),
                    "satelite": REFERENCE_SATELLITE,
                    "municipio": str(row.get("municipio", "")).strip(),
                    "municipio_id": int(MUNICIPALITY_CODE),
                    "estado": str(row.get("estado", "")).strip(),
                    "bioma": str(row.get("bioma", "")).strip() or None,
                }
                for name in ("frp", "precipitacao", "risco_fogo"):
                    try:
                        properties[name] = float(str(row.get(name, "")).strip())
                    except (TypeError, ValueError):
                        properties[name] = None
                try:
                    properties["numero_dias_sem_chuva"] = int(str(row.get("numero_dias_sem_chuva", "")).strip())
                except (TypeError, ValueError):
                    properties["numero_dias_sem_chuva"] = None
                subset_rows.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                    "properties": properties,
                })
        kept.extend(subset_rows)
        totals[period] = {"period": period[:4] + "-" + period[4:], "sourceRows": source_rows, "unaiReferenceDetections": len(subset_rows)}

    kept.sort(key=lambda feature: str(feature.get("properties", {}).get("data_hora_gmt", "")))
    atomic_json(SUBSET, {"type": "FeatureCollection", "features": kept})
    manifest.update({
        "completedThrough": max(totals)[:4] + "-" + max(totals)[4:] if totals else None,
        "extractedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "totals": [totals[key] for key in sorted(totals)],
    })
    atomic_json(MANIFEST, manifest)
    print(json.dumps({"retainedFeatures": len(kept), "updatedMonths": requested, "manifest": str(MANIFEST)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
