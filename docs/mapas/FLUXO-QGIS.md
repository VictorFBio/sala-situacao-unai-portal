# Do QGIS aos Mapas Temáticos

## Como vamos trabalhar

O QGIS continua sendo o ambiente de criação no computador: preparar dados, conferir geometria, fazer junções e escolher as classes do mapa. O portal recebe uma cópia pública das camadas em GeoJSON, acompanhada de configurações e metadados. O Leaflet, incluído no próprio pacote, oferece zoom, navegação, consulta e controle das camadas.

Esta versão usa camadas públicas locais e a hospedagem já existente. O fundo é independente dessas camadas: imagens históricas CBERS-4A/WPM do INPE, carregadas por blocos conforme a navegação, ruas do OpenStreetMap ou cartografia simples. Não exige assinatura, chave de API ou servidor geográfico. A simbologia é registrada no catálogo do portal: a aparência de um projeto QGIS não é transferida automaticamente.

O piloto usa três cenas CBERS-4A de 03 e 29/09/2026, com cor RGB fusionada e resolução de 2 m (pancromática de 2 m e multiespectral de 8 m). As cenas e suas coberturas estão em `maps/data/basemaps.json`, com origem, data e licença CC BY 4.0. A ampliação acima do zoom nativo 16 amplia pixels, sem criar detalhe. A cobertura das cenas não equivale à cobertura completa de todo o município e pode conter bordas sem imagem. Os 32 locais ficam dentro das coberturas selecionadas.

Fontes: [sensor CBERS-4A — INPE](https://data.inpe.br/dados/cbers-4a/), [catálogo STAC](https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-PCA-FUSED-1), [manual do serviço de imagens](https://data.inpe.br/big/web/wp-content/uploads/2024/05/CatalogoIntegrado_ComoUsar.v0.1-2.pdf) e [política de uso dos blocos OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/).

Os fornecedores externos recebem as solicitações dos blocos visíveis e metadados técnicos de acesso. As camadas locais e dados de saúde não são enviados ao serviço de imagens. Não há download em massa, cache offline nem garantia de disponibilidade. Falha completa do fundo ativa a cartografia simples; falhas parciais mantêm os blocos disponíveis com aviso. Pontos, polígonos e lista permanecem consultáveis.

## 1. Preparar e revisar no QGIS

1. Preserve o projeto e a fonte original. Trabalhe em uma cópia e registre fonte, período, unidade e recorte territorial.
2. Confira o sistema de coordenadas atribuído à camada. Quando necessário, **reprojete na exportação**; apenas trocar a identificação do sistema pode deslocar a geometria.
3. Confira geometrias, locais repetidos, junções e campos sem informação. Uma ausência após junção permanece ausente. Não a substitua por zero.
4. Selecione somente os atributos autorizados para consulta pública. Não exporte prontuários, telefones privados, endereços de pacientes, identificadores pessoais ou dados de pessoas.
5. Para camadas grandes, faça uma cópia simplificada para visualização e registre esse tratamento. Compare o resultado com a original antes de aceitar a simplificação.

No piloto, a fonte pública é o `mapa-servicos.json` do painel. O preparo usa seus atributos já selecionados, em vez de expor todo o GeoPackage original. O script `scripts/prepare-maps.mjs` reprojeta EPSG:31983 para EPSG:4326, confere os 32 locais e registra os hashes. Não execute esse script para um novo tema: ele é específico da derivação do piloto.

## 2. Exportar uma camada pública

No painel de camadas do QGIS, clique com o botão direito na camada e escolha **Exportar → Salvar feições como…**. Selecione **GeoJSON** e **EPSG:4326 — WGS 84**. O arquivo para a web deve conter longitude primeiro e latitude depois, em graus. Use UTF-8 e selecione os campos públicos.

Salve os arquivos do novo tema em `maps/data/identificador-do-tema/`. Use nomes sem espaços ou acentos. Os GeoJSON devem ser `FeatureCollection`, sem declaração `crs`, com coordenadas finitas. Confira no QGIS a cópia exportada, sua posição e o número de feições.

Para pontos consultáveis, use geometria `Point`: são necessários `codigo` único em todo o tema, `nome` e `grupo`. Códigos repetidos entre arquivos também impedem a publicação. O piloto também usa `endereco`, `bairro`, `rural`, `qualidade_geocodificacao` e `observacao`. Os pontos de um mesmo grupo usam a mesma configuração. Camadas territoriais aceitam linhas ou polígonos e podem ter seus próprios campos de consulta. A estrutura das coordenadas, a quantidade mínima de posições e o fechamento dos anéis são conferidos no preparo e no build.

## 3. Registrar fonte e interpretação

Crie `metadata.json` na pasta do tema, tomando o piloto como referência de estrutura. Preencha com evidência:

- `source.label`, `source.period`, `source.links`: fonte principal, período dos dados e links originais;
- `contextSource`: fonte e período das referências territoriais;
- `unit`: o que está sendo contado ou representado;
- `limitations`: restrições, ausências, critérios de junção e tratamentos aplicados;
- `preparedAt`, `sourceCrs`, `publicationCrs`: preparo e sistemas de coordenadas.

A data de preparo não renova a data da fonte. Quando não houver período ou validação, declare a pendência. Use `null` para valores ausentes, preservando zeros efetivamente documentados. Guarde uma prova dos arquivos de origem e dos arquivos preparados em `provenance.json`, como no piloto. Quando essa prova estiver presente, o build exige que todos os arquivos do tema e os metadados estejam registrados com hashes correspondentes. O preparo do piloto substitui o conjunto completo somente depois de terminar as conversões e validações; uma falha conserva a versão anterior.

## 4. Acrescentar o tema ao catálogo

Edite `maps/data/catalogue.json` e acrescente um objeto à lista `themes`. Cada tema tem `id` único, `title`, `description`, `status`, `metadataPath` e `layers`. Use `piloto-local` durante a revisão; a disponibilidade pública exige revisão do tema concreto.

Cada camada informa `id`, `label`, `path`, `geometryTypes`, `kind`, `visible` e `style`. Caminhos são relativos à área de mapas, por exemplo `data/identificador-do-tema/camada.geojson`, e não podem apontar para serviços externos. `visible` define o estado inicial.

Para pontos, use `kind: "points"`, um `group` que corresponda ao atributo `grupo` dos dados e `popupFields` com os campos e rótulos de consulta. Vários grupos podem usar o mesmo arquivo, como no piloto. Os símbolos disponíveis são `circle`, `square`, `cross`, `diamond` e `triangle`. Para linhas e polígonos, use `kind: "context"`, `geometryTypes` correspondente e, quando pertinente, `popupFields`. Use os IDs `municipio` e `urbano` para as referências dos enquadramentos existentes.

Uma cor fixa usa `color`, `fillColor`, `fillOpacity` e `weight`. Para classificação numérica, `style.field` identifica um campo **numérico**, `style.classes` registra faixas com `min`, `max`, `color` e `label`, e `style.missing` registra a cor e o rótulo da ausência. As faixas incluem o mínimo e excluem o máximo; `max: null` só é permitido na última faixa. Não pode haver sobreposição. Valores ausentes ou não numéricos recebem a classe de ausência. Um valor numérico fora das faixas **impede a publicação** e gera aviso de camada inválida no visualizador: ele não vira “Sem informação”. Cubra todo o domínio numérico válido, inclusive valores negativos quando pertinentes. Defina limites com base na metodologia do novo tema, sem reutilizar automaticamente os limites de outro indicador.

Para habilitar os fundos neste tema, use `basemapsPath: "data/basemaps.json"`. O preparo valida a configuração e a origem oficial antes de publicar. `initialView: "urbano"` abre na área principal, identificada pelo maior polígono urbanizado do IBGE. O enquadramento municipal e a lista continuam permitindo consultar os locais fora dessa vista. Pontos próximos são agrupados até o zoom 16; a aproximação ou a seleção na lista mostra cada local. Use “Ampliar mapa” para consultar em uma área maior e Esc para sair.

O fundo de satélite já está implementado. Outros rasters temáticos, animação temporal e mapas de calor exigem dados e finalidade definidos. Não há temas epidemiológicos fictícios neste piloto.

## 5. Conferir a versão local

Na pasta `mapas-piloto`, abra um terminal PowerShell. Com Node.js 22 ou posterior e os repositórios lado a lado:

```powershell
New-Item -ItemType Directory -Force .qa-temp | Out-Null
$env:TEMP = Join-Path (Get-Location).Path '.qa-temp'
$env:TMP = $env:TEMP
$env:PANEL_SOURCE = '../painel'
npm test
npm run preview:mapas -- --panel=../painel --legacy=../painel/dist-ecossistema --port=4174
```

A prévia apresenta o endereço `http://127.0.0.1:4174/mapas-de-saude/`. Ela cria uma saída própria em `.preview/`, mantém o painel compilado existente e confere seus cinco arquivos de dados. Se a cópia compilada e a fonte divergirem, o preparo para. O servidor fica disponível somente neste computador enquanto o terminal permanecer em execução; Ctrl+C o encerra. Uma nova execução gera outra pasta de saída.

Confira catálogo, camadas, legenda, unidade, valores ausentes, filtros, enquadramentos, consultas, celular e downloads. O download contém a camada completa. A lista e as fontes de cada tema ficam preparadas no documento. Uma falha parcial mantém seus locais na lista, identifica os que estão indisponíveis no mapa e distingue o total da lista do total desenhado. A troca de tema apresenta o contexto do próprio tema, mesmo quando um arquivo falha. Atribuição e unidade vêm dos seus metadados; temas sem pontos usam camadas e consultas territoriais.

No pacote gerado, GeoJSON recebe a extensão `.json` para respeitar o publicador atual. O conteúdo geográfico permanece GeoJSON e pode ser aberto no QGIS. Scripts públicos recebem `.js`; licença e mapa de código da biblioteca são preservados em arquivos JSON. As fontes locais continuam com seus nomes originais.

## 6. Publicar após a revisão

Alterar um arquivo no computador não atualiza o domínio. Depois da revisão, selecione o commit do portal no `modules.json` do publicador, gere a homologação pelo fluxo existente e confira o pacote concreto antes da ativação externa. O piloto foi publicado após autorização; a atualização dos fundos usa o mesmo fluxo de homologação e verificação.

Os locais do piloto têm endereços de referência consultados em 09/09/2026, limites IBGE 2025 e área urbanizada IBGE 2019. Coordenadas aproximadas não comprovam funcionamento atual, cobertura de equipe ou delimitação legal do perímetro urbano. Os 23 registros documentais de ESF foram agrupados em 18 locais: locais não equivalem a equipes.
