# Piloto de queimadas em Unaí

## Estado

O catálogo atual de **Mapas Temáticos** tem uma opção “Queimadas e focos de calor”. Ela permanece marcada como `piloto-local` para revisão. O mapa usa o visualizador Leaflet já existente, sem serviço novo ou assinatura. A preparação e o GeoPackage de trabalho ficam no computador; o pacote do site contém somente os extratos municipais, as referências necessárias e o par de imagens recortado.

## Camadas e interpretação

- **Focos de calor:** INPE, satélite de referência AQUA M-T, de 2020 a 2025 por camadas anuais WFS e 2026 por CSV mensal do Brasil filtrado para Unaí e AQUA M-T. A série de 2026 está parcial até setembro na versão atual. Foram derivados 688 registros: 110 em 2020, 147 em 2021, 89 em 2022, 87 em 2023, 97 em 2024, 120 em 2025 e 38 em 2026. São detecções orbitais; a mesma ocorrência pode aparecer mais de uma vez.
- **Área queimada:** polígonos mensais do AQ1KM, Coleção 2, de janeiro de 2020 a setembro de 2026; 712 feições no recorte municipal. A resolução é aproximada de 1 km e o produto é provisório. A contagem de feições não é hectares, incêndios ou cicatrizes únicas.
- **Contexto territorial:** limite municipal IBGE 2025, 26 localidades do Censo 2022 e 32 pontos de serviços públicos já usados pela Sala. Localidades são referência censitária; os pontos de serviço mantêm as ressalvas de posição aproximada da camada original.
- **Imagem piloto antes/depois:** duas cenas CBERS-4A WPM do INPE/BDC, 03 e 29/09/2026, recortadas para a mesma extensão e dimensão. O intervalo contém detecções de referência em 10/09. A comparação serve para inspeção visual; não confirma cicatriz nem causa. O campo de cobertura de nuvens não foi informado para as cenas. Crédito e licença CC BY 4.0 ficam junto aos metadados.

O seletor combina ano e mês. 2026 aparece como parcial. Focos, AQ1KM, localidades, serviços e limite municipal podem ser ligados ou desligados. Quando um filtro não retorna feições, a interface informa a ausência no recorte e não a interpreta como ausência de queimadas. Ao ativar a comparação, o mapa enquadra as imagens; o controle deslizante revela a cena anterior sobre a posterior.

Os fundos de ruas do OpenStreetMap e de satélite CBERS permanecem referências online já integradas ao visualizador. A aplicação carrega somente os blocos visíveis e exibe atribuição. Não fazer download em massa de blocos OSM.

## Fontes

- [INPE · dados abertos de queimadas](https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/), [WFS](https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/ows) e [CSV mensal de focos](https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/). O portal identifica os dados como abertos para uso público, mas não informa uma licença padronizada na página consultada.
- [INPE · produto AQ1KM](https://terrabrasilis.dpi.inpe.br/queimadas/aq1km/) e [arquivos mensais](https://dataserver-coids.inpe.br/queimadas/queimadas/area_queimada/colecao2/shp/).
- [IBGE · malhas territoriais](https://www.ibge.gov.br/geociencias/todos-os-produtos-geociencias/15774-malhas.html), [nota técnica e legal da malha 2025](https://biblioteca.ibge.gov.br/index.php/biblioteca-catalogo?view=detalhes&id=2102268) e [localidades do Brasil](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/27385-localidades.html). A licença padronizada não foi confirmada nos metadados consultados; os termos de uso da edição 2025 e os créditos da camada de serviços devem ser preservados.
- [Itens STAC INPE/BDC: 03/09/2026](https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-PCA-FUSED-1/items/CBERS4A_WPM_PCA_RGB321_20260903_204_133) e [29/09/2026](https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-PCA-FUSED-1/items/CBERS4A_WPM_PCA_RGB321_20260929_205_133).
- [Política de uso dos blocos OSM](https://operations.osmfoundation.org/policies/tiles/).

## Preparação local no QGIS

Os arquivos-fonte já coletados ficam em `.sources/queimadas/`, pasta ignorada pelo Git e pelo pacote do site. Nela estão os WFS anuais recortados para o município, os arquivos AQ1KM mensais, o extrato das localidades IBGE, os recortes de teste das cenas e o GeoPackage local de trabalho `preparo.gpkg`. Nenhum CSV nacional integral é incluído nos arquivos publicados.

1. Para acrescentar meses de focos de 2026, execute `scripts/extract-queimadas-2026.py` no repositório, por exemplo `python scripts/extract-queimadas-2026.py --months 202610`. O script lê o CSV nacional em fluxo, conserva apenas Unaí (3170404) e AQUA M-T e atualiza o extrato e o manifesto locais; não guarda o CSV nacional.
2. Baixe o arquivo mensal AQ1KM correspondente da pasta oficial do INPE e coloque-o em `.sources/queimadas/` com o nome `aq1km-AAAA-MM.zip`. Para manter a série contínua, a preparação para se houver mês ausente.
3. Baixe a [malha municipal IBGE 2025 de MG](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/UFs/MG/MG_Municipios_2025.zip) para `.sources/queimadas/MG_Municipios_2025.zip` e extraia o conteúdo em `.sources/queimadas/ibge2025/`. O arquivo usado na preparação deve ter SHA-256 `15313BAF3A05D43F03C50DACB605E2B07F6E3CD961AA1594C8E4AEFBD6BAACD7` para reproduzir esta derivação. No console Python do QGIS aberto, execute `scripts/prepare-queimadas.py` pelo caminho absoluto deste checkout, usando `exec(compile(open(caminho, encoding="utf-8").read(), caminho, "exec"), {"__file__": caminho})`. O mesmo script pode ser chamado pelo MCP QGIS. Ele filtra o código municipal 3170404 na geometria oficial original, recorta e reprojeta em EPSG:4326, recria o GeoPackage local, atualiza os períodos disponíveis no catálogo, recalcula os metadados e grava os hashes dos arquivos derivados.
4. Revise `.sources/queimadas/preparo-relatorio.json`, as camadas no QGIS e as bordas municipais. Em seguida, rode `npm test`, `npm run build` e a prévia local descrita no [fluxo QGIS](FLUXO-QGIS.md). Inspecione o seletor temporal, as camadas, o crédito, a procedência recolhida e a comparação em telas grandes e pequenas.

O extrator mensal está limitado a 2026; para outro ano, confira primeiro a disponibilidade e o nome da camada anual no WFS do INPE e atualize a regra de aquisição. As cenas do comparador são um par fixo de demonstração e devem ser reavaliadas antes de escolher outro evento ou intervalo. Nenhuma execução de preparo publica automaticamente no domínio.
