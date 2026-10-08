# Portal da Sala de Situação de Saúde de Unaí

Portal institucional estático, separado do painel. Node.js 22 ou posterior, Git e nenhum pacote npm adicional. O portal usa dados públicos do painel apenas para gerar o catálogo; não altera indicadores.

## Instalar e testar

Clone também `VictorFBio/sala-situacao-unai-v2`, instale suas dependências com `npm ci` e mantenha as pastas lado a lado, como `portal` e `painel`. O painel fornece marcas autorizadas e os cinco JSON existentes.

```sh
PANEL_SOURCE=../painel node --test tests/*.test.mjs
node scripts/build.mjs --panel=../painel --revision=COMMIT_COMPLETO_DO_PAINEL --base=/ --environment=homologacao
```

No PowerShell, defina `$env:PANEL_SOURCE='../painel'` antes de `npm test`. A referência precisa conter os 40 caracteres do commit. A saída é `dist/`. Não publique a pasta de trabalho.

## Manutenção

Regra visual: usar a paleta sóbria do painel (azul institucional, branco e cinzas), superfícies planas e cantos retos. Não usar cores ou efeitos neon, brilho ou sombras decorativas. Estados precisam continuar identificados por texto, e o foco de teclado deve permanecer visível. O raio dos componentes do portal é zero.

Páginas e catálogo: `scripts/build.mjs`. Identidade: `shared/v1/portal.css`. Compatibilidade dos links antigos: `shared/v1/routes.js`. Faça alterações por PR, execute testes e selecione o commit aprovado no `modules.json` do publicador. Nenhuma alteração aqui aciona a produção automaticamente.

As áreas Rede, Boletins e Análises aparecem como em preparação. Mapas encaminha para a consulta territorial existente. Fontes cadastradas e consultas presentes são estados distintos; presença de registros não é validação epidemiológica.

## Publicação e recuperação

O publicador reúne este repositório e o painel. A homologação tem endereço separado, aviso visível e `noindex`. A ativação no domínio principal ocorrerá somente após aprovação da versão concreta e após a avaliação de 15/10/2026. Para recuperar uma versão, retorne a referência do portal no manifesto e gere novamente o pacote; consulte o procedimento central no repositório do painel.

## Reprodução municipal e direitos

O código original deste portal usa MIT. Dados, documentos, marcas, imagens e componentes de terceiros mantêm seus próprios direitos. Os logotipos são obtidos do painel, não sublicenciados aqui. Outro município deve substituir identidade, textos, fontes e contatos, revisar os dados e assumir sua governança. Não há backend, cookies analíticos ou formulário de coleta nesta versão.
