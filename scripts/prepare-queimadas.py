"""Prepare local, clipped fire-theme layers with the active QGIS Python runtime.

Run from the QGIS Python Console with:
    exec(compile(open(r".../scripts/prepare-queimadas.py", encoding="utf-8").read(), r".../scripts/prepare-queimadas.py", "exec"))

All source downloads stay under .sources/queimadas. Only municipal extracts and
the small satellite comparison pair are written to maps/data/queimadas.
"""

from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import zipfile

from qgis.core import (
    QgsCoordinateReferenceSystem,
    QgsCoordinateTransform,
    QgsFeature,
    QgsFeatureRequest,
    QgsGeometry,
    QgsProject,
    QgsVectorFileWriter,
    QgsVectorLayer,
)
from qgis.PyQt.QtCore import Qt


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / ".sources" / "queimadas"
OUTPUT = ROOT / "maps" / "data" / "queimadas"
WORKING_GPKG = SOURCE / "preparo.gpkg"
BOUNDARY_ARCHIVE_PATH = SOURCE / "MG_Municipios_2025.zip"
BOUNDARY_ARCHIVE_URL = "https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/UFs/MG/MG_Municipios_2025.zip"
TARGET_CRS = QgsCoordinateReferenceSystem("EPSG:4326")
PROJECT = QgsProject.instance()
BOUNDARY_PATH = SOURCE / "ibge2025" / "MG_Municipios_2025.shp"
MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def load_layer(path, name):
    layer = QgsVectorLayer(str(path), name, "ogr")
    if not layer.isValid():
        raise RuntimeError("Camada local inválida: " + str(path))
    return layer


def as_plain(value):
    if value is None:
        return None
    if hasattr(value, "toPyObject"):
        value = value.toPyObject()
    if hasattr(value, "toString") and not isinstance(value, str):
        value = value.toString()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def qgis_text(value):
    if value is None:
        return ""
    if hasattr(value, "toString"):
        try:
            return value.toString(Qt.ISODate)
        except Exception:
            pass
    return str(value)


def number(value):
    if value in (None, ""):
        return None
    try:
        result = float(value)
        return result if result == result else None
    except (TypeError, ValueError):
        return None


def integer(value):
    result = number(value)
    return int(result) if result is not None else None


def period_label(period):
    year, month = period.split("-")
    return f"{MONTH_NAMES[int(month) - 1]} de {year}"


def valid_source_date(value, expected_year):
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except (TypeError, ValueError):
        return False
    return parsed.strftime("%Y-%m-%d") == value and parsed.year == expected_year


def reproject_geometry(geometry, source_crs):
    geometry = QgsGeometry(geometry)
    if source_crs != TARGET_CRS:
        geometry.transform(QgsCoordinateTransform(source_crs, TARGET_CRS, PROJECT))
    return geometry


def clipped_geometry(geometry, source_crs, boundary_geometry, boundary_bounds):
    geometry = reproject_geometry(geometry, source_crs)
    if not geometry.boundingBox().intersects(boundary_bounds):
        return None
    if not geometry.intersects(boundary_geometry):
        return None
    result = geometry.intersection(boundary_geometry)
    if result.isNull() or result.isEmpty():
        return None
    if not result.isGeosValid():
        result = result.makeValid()
    if result.isNull() or result.isEmpty() or not result.isGeosValid():
        raise RuntimeError("Geometria inválida após recorte municipal")
    return result


def feature_json(geometry, properties):
    return {
        "type": "Feature",
        "geometry": json.loads(geometry.asJson(8)),
        "properties": properties,
    }


def write_geojson(filename, features):
    path = OUTPUT / filename
    path.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return path


def add_to_working_gpkg(name, path, first):
    layer = load_layer(path, name)
    options = QgsVectorFileWriter.SaveVectorOptions()
    options.driverName = "GPKG"
    options.fileEncoding = "UTF-8"
    options.layerName = name
    if not first:
        options.actionOnExistingFile = QgsVectorFileWriter.CreateOrOverwriteLayer
    result = QgsVectorFileWriter.writeAsVectorFormatV3(layer, str(WORKING_GPKG), PROJECT.transformContext(), options)
    if result[0] != QgsVectorFileWriter.NoError:
        raise RuntimeError("Falha ao gravar camada de trabalho " + name + ": " + str(result))
    return layer.featureCount()


def annual_hotspot_rows(boundary_geometry, boundary_bounds):
    rows = []
    counts = {}
    for year in range(2020, 2026):
        source_path = SOURCE / f"focos-{year}-unai.geojson"
        layer = load_layer(source_path, f"focos_{year}")
        count = 0
        for feature in layer.getFeatures():
            attrs = dict(zip(layer.fields().names(), feature.attributes()))
            if attrs.get("satelite") != "AQUA_M-T":
                continue
            raw_date = (qgis_text(attrs.get("data_pas")) or qgis_text(attrs.get("data_hora_gmt")))[:10]
            if not valid_source_date(raw_date, year):
                raise RuntimeError(f"Data inválida no arquivo de focos {year}: {raw_date!r}")
            geometry = clipped_geometry(feature.geometry(), layer.crs(), boundary_geometry, boundary_bounds)
            if geometry is None:
                continue
            foco_id = attrs.get("foco_id") or attrs.get("id_foco_bdq")
            rows.append(feature_json(geometry, {
                "codigo": str(foco_id or attrs.get("id_foco_bdq") or f"{year}-{count}"),
                "nome": "Foco de calor",
                "periodo": raw_date[:7],
                "data_pas": raw_date,
                "data_hora_gmt": qgis_text(attrs.get("data_hora_gmt")),
                "satelite": "AQUA_M-T",
                "municipio": "Unaí",
                "frp": number(attrs.get("frp")),
                "numero_dias_sem_chuva": integer(attrs.get("numero_dias_sem_chuva")),
                "risco_fogo": number(attrs.get("risco_fogo")),
                "precipitacao": number(attrs.get("precipitacao")),
                "bioma": str(attrs.get("bioma") or "") or None,
            }))
            count += 1
        counts[str(year)] = count

    layer = load_layer(SOURCE / "focos-2026-unai-satref.geojson", "focos_2026")
    count = 0
    for feature in layer.getFeatures():
        attrs = dict(zip(layer.fields().names(), feature.attributes()))
        if attrs.get("satelite") != "AQUA_M-T":
            continue
        raw_datetime = qgis_text(attrs.get("data_hora_gmt"))
        raw_date = raw_datetime[:10]
        if not valid_source_date(raw_date, 2026):
            raise RuntimeError(f"Data inválida no arquivo de focos 2026: {raw_date!r}")
        geometry = clipped_geometry(feature.geometry(), layer.crs(), boundary_geometry, boundary_bounds)
        if geometry is None:
            continue
        foco_id = attrs.get("foco_id") or f"2026-{count}"
        rows.append(feature_json(geometry, {
            "codigo": str(foco_id),
            "nome": "Foco de calor",
            "periodo": raw_date[:7],
            "data_pas": raw_date,
            "data_hora_gmt": raw_datetime.replace(" ", "T") + ("Z" if not raw_datetime.endswith("Z") else ""),
            "satelite": "AQUA_M-T",
            "municipio": "Unaí",
            "frp": number(attrs.get("frp")),
            "numero_dias_sem_chuva": integer(attrs.get("numero_dias_sem_chuva")),
            "risco_fogo": number(attrs.get("risco_fogo")),
            "precipitacao": number(attrs.get("precipitacao")),
            "bioma": str(attrs.get("bioma") or "") or None,
        }))
        count += 1
    counts["2026"] = count
    return rows, counts


def aq1km_features(boundary_geometry, boundary_bounds):
    features = []
    by_year = {}
    archives = []
    for archive in SOURCE.glob("aq1km-*.zip"):
        period = archive.stem.removeprefix("aq1km-")
        if len(period) == 7 and period[:4].isdigit() and period[4] == "-" and period[5:].isdigit() and 1 <= int(period[5:]) <= 12:
            if 2020 <= int(period[:4]) <= 2026:
                archives.append((period, archive))
    archives.sort(key=lambda item: item[0])
    if not archives or archives[0][0] != "2020-01":
        raise RuntimeError("Arquivos AQ1KM devem começar em 2020-01")
    latest = archives[-1][0]
    expected = []
    year, month = 2020, 1
    while f"{year:04d}-{month:02d}" <= latest:
        expected.append(f"{year:04d}-{month:02d}")
        month += 1
        if month == 13:
            year += 1
            month = 1
    actual = [period for period, _ in archives]
    if actual != expected:
        raise RuntimeError("Série AQ1KM com mês ausente: confira os arquivos locais antes de preparar")
    for period, archive in archives:
        with zipfile.ZipFile(archive) as source_zip:
            member = next((name for name in source_zip.namelist() if name.lower().endswith(".shp")), None)
        if not member:
            raise RuntimeError("Shapefile ausente em " + archive.name)
        uri = "/vsizip/" + archive.as_posix() + "/" + member
        layer = load_layer(uri, "aq1km_" + period)
        count = 0
        for feature in layer.getFeatures(QgsFeatureRequest().setFilterRect(boundary_bounds)):
            geometry = clipped_geometry(feature.geometry(), layer.crs(), boundary_geometry, boundary_bounds)
            if geometry is None:
                continue
            attrs = dict(zip(layer.fields().names(), feature.attributes()))
            features.append(feature_json(geometry, {
                "codigo": f"AQ1KM-{period}-{feature.id()}",
                "periodo": period,
                "data": qgis_text(attrs.get("data")) or None,
                "DN": integer(attrs.get("DN")),
                "produto": "AQ1KM Collection 2",
            }))
            count += 1
        by_year[period[:4]] = by_year.get(period[:4], 0) + count
    return features, by_year


def ibge_localities(boundary_geometry, boundary_bounds):
    layer = load_layer(SOURCE / "localidades-ibge-2022" / "BR_localidades_2022.gpkg", "localidades_ibge_2022")
    muni_field = layer.fields().indexFromName("CD_MUN")
    features = []
    for feature in layer.getFeatures(QgsFeatureRequest().setFilterExpression('"CD_MUN" = \'3170404\'')):
        geometry = clipped_geometry(feature.geometry(), layer.crs(), boundary_geometry, boundary_bounds)
        if geometry is None:
            continue
        attrs = dict(zip(layer.fields().names(), feature.attributes()))
        features.append(feature_json(geometry, {
            "codigo": str(attrs.get("CD_LOCALIDADE") or attrs.get("id") or ""),
            "nome": str(attrs.get("NM_LOCALIDADE") or ""),
            "categoria": str(attrs.get("CT_LOCALIDADE") or ""),
            "subcategoria": str(attrs.get("SCT_LOCALIDADE") or ""),
            "municipio": "Unaí",
            "ano_referencia": 2022,
        }))
    if muni_field < 0:
        raise RuntimeError("Campo CD_MUN não encontrado nas localidades IBGE")
    return features


OUTPUT.mkdir(parents=True, exist_ok=True)
if not BOUNDARY_ARCHIVE_PATH.is_file():
    raise RuntimeError("Arquivo original do limite municipal IBGE 2025 ausente em " + str(BOUNDARY_ARCHIVE_PATH))
boundary_archive_sha256 = hashlib.sha256(BOUNDARY_ARCHIVE_PATH.read_bytes()).hexdigest().upper()
if WORKING_GPKG.exists():
    WORKING_GPKG.unlink()

boundary_layer = load_layer(BOUNDARY_PATH, "limite_municipal")
boundary_feature = next(boundary_layer.getFeatures(QgsFeatureRequest().setFilterExpression('"CD_MUN" = \'3170404\'')), None)
if boundary_feature is None:
    raise RuntimeError("Limite original IBGE 2025 do município 3170404 não encontrado")
boundary_geometry = reproject_geometry(boundary_feature.geometry(), boundary_layer.crs())
boundary_bounds = boundary_geometry.boundingBox()

focos, focos_counts = annual_hotspot_rows(boundary_geometry, boundary_bounds)
write_geojson("focos.geojson", focos)

aq1km, aq1km_counts = aq1km_features(boundary_geometry, boundary_bounds)
write_geojson("area-queimada.geojson", aq1km)

localities = ibge_localities(boundary_geometry, boundary_bounds)
write_geojson("localidades.geojson", localities)

boundary_properties = {
    field.name(): as_plain(boundary_feature.attribute(field.name()))
    for field in boundary_layer.fields()
}
write_geojson("municipio.geojson", [feature_json(boundary_geometry, boundary_properties)])
shutil.copyfile(ROOT / "maps" / "data" / "rede-servicos" / "locais.geojson", OUTPUT / "servicos.geojson")
shutil.copyfile(SOURCE / "pair-before-test.jpg", OUTPUT / "comparacao-antes.jpg")
shutil.copyfile(SOURCE / "pair-after-test.jpg", OUTPUT / "comparacao-depois.jpg")

working_counts = {}
for index, layer_name in enumerate(["focos", "area-queimada", "localidades", "municipio", "servicos"]):
    working_counts[layer_name] = add_to_working_gpkg(layer_name, OUTPUT / ("municipio.geojson" if layer_name == "municipio" else "servicos.geojson" if layer_name == "servicos" else "area-queimada.geojson" if layer_name == "area-queimada" else layer_name + ".geojson"), index == 0)

focus_manifest = json.loads((SOURCE / "focos-2026-extraction.json").read_text(encoding="utf-8"))
focus_latest = focus_manifest.get("completedThrough") or focus_manifest.get("completeThrough") or "2026-09"
aq_latest = max(archive.stem.removeprefix("aq1km-") for archive in SOURCE.glob("aq1km-*.zip"))
available_latest = {"focos": focus_latest, "area-queimada": aq_latest}
years = list(range(2020, max(int(period[:4]) for period in available_latest.values()) + 1))
partial_year = max(years) if any(period[:4] == str(max(years)) and period[5:] != "12" for period in available_latest.values()) else None
catalogue_path = ROOT / "maps" / "data" / "catalogue.json"
catalogue = json.loads(catalogue_path.read_text(encoding="utf-8"))
fire_theme = next(theme for theme in catalogue["themes"] if theme["id"] == "queimadas")
fire_theme["temporal"]["years"] = years
fire_theme["temporal"]["partialYear"] = partial_year
fire_theme["temporal"]["latestByLayer"] = available_latest
catalogue_path.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

report = {
    "preparedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    "targetCrs": "EPSG:4326",
    "municipio": "Unaí (3170404)",
    "municipalBoundary": {
        "source": "IBGE Malha Municipal 2025 · MG_Municipios_2025.zip",
        "url": BOUNDARY_ARCHIVE_URL,
        "archiveSha256": boundary_archive_sha256,
    },
    "focosByYear": focos_counts,
    "focosTotal": len(focos),
    "aq1kmByYear": aq1km_counts,
    "aq1kmTotal": len(aq1km),
    "localidadesTotal": len(localities),
    "workingGeoPackage": str(WORKING_GPKG),
    "workingLayers": working_counts,
    "publicFiles": [str(path) for path in sorted(OUTPUT.iterdir()) if path.is_file()],
}
metadata = json.loads((OUTPUT / "metadata.json").read_text(encoding="utf-8"))
metadata_source = metadata["source"]
metadata["contextSource"]["boundaryArchiveSha256"] = boundary_archive_sha256
metadata_source["period"] = f"Focos: janeiro de 2020 a {period_label(focus_latest)}; AQ1KM: janeiro de 2020 a {period_label(aq_latest)}." + (f" {partial_year} é parcial." if partial_year else "")
metadata_source["filters"][1] = f"Focos de 2020–2025: WFS anual para AQUA_M-T; 2026: CSV mensal filtrado por município 3170404 e AQUA_M-T, disponível até {period_label(focus_latest)}."
metadata_source["filters"][2] = f"Área queimada: arquivos mensais AQ1KM Coleção 2 de janeiro de 2020 até {period_label(aq_latest)}, recortados ao limite municipal."
metadata["limitations"] = [
    f"A série {partial_year} está incompleta após {period_label(focus_latest)}. A ausência de registros em um mês ou na camada não comprova ausência de queimadas." if note.startswith("A série 2026 está incompleta") and partial_year else note
    for note in metadata["limitations"]
]
(OUTPUT / "metadata.json").write_text(
    json.dumps({
        **metadata,
        "preparedAt": report["preparedAt"],
        "counts": {
            "focosPorAno": focos_counts,
            "areaQueimadaPorAno": aq1km_counts,
            "localidadesCenso2022": len(localities),
            "servicosPublicos": working_counts["servicos"],
        },
    }, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
proof_files = []
feature_counts = {
    "focos.geojson": len(focos),
    "area-queimada.geojson": len(aq1km),
    "localidades.geojson": len(localities),
    "municipio.geojson": 1,
    "servicos.geojson": working_counts["servicos"],
}
required_files = ["focos.geojson", "area-queimada.geojson", "localidades.geojson", "municipio.geojson", "servicos.geojson", "comparacao-antes.jpg", "comparacao-depois.jpg", "metadata.json"]
for filename in required_files:
    contents = (OUTPUT / filename).read_bytes()
    item = {
        "path": filename,
        "sha256": hashlib.sha256(contents).hexdigest(),
        "bytes": len(contents),
    }
    if filename in feature_counts:
        item["features"] = feature_counts[filename]
    proof_files.append(item)
(OUTPUT / "provenance.json").write_text(json.dumps({
    "schemaVersion": 1,
    "preparedAt": report["preparedAt"],
    "municipalityCode": "3170404",
    "publicationCrs": "EPSG:4326",
    "transformation": {"tool": "QGIS / PyQGIS", "operation": "recorte municipal, reprojeção e seleção de atributos públicos"},
    "counts": {"focos": len(focos), "areaQueimadaAQ1KM": len(aq1km), "localidadesCenso2022": len(localities), "servicos": working_counts["servicos"]},
    "periods": available_latest,
    "inputs": {
        "municipalBoundary": {
            "archive": BOUNDARY_ARCHIVE_PATH.name,
            "url": BOUNDARY_ARCHIVE_URL,
            "sha256": boundary_archive_sha256,
            "downloadedAt": metadata["contextSource"].get("boundaryDownloadedAt"),
        },
    },
    "files": proof_files,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(SOURCE / "preparo-relatorio.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
