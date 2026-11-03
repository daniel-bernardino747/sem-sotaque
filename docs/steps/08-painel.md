# 08: Painel do Daniel

## Objetivo

O Daniel acompanha os testers, lê cada sessão inteira e vê o critério de validação num lugar só.

## Ler antes

- `docs/decisoes.md` ("O v0")
- O schema do passo 02 (`eventos`, `mensagens`, `chamadas_llm`, `selections`, `renders`, `fechamento`)

## Fazer

1. **`/admin`** protegido por `ADMIN_TOKEN`, num cookie httpOnly depois de um formulário. Sem conta de usuário.
2. **Critério no topo:** testers com link aberto, que consentiram, que completaram o interrogatório (`terminou`) e que viraram fundador ou indicaram, contra as metas (≥ 6 de 10 completam; ≥ 4 de 10 fundador ou indicação).
3. **Funil:** link aberto → consentiu → importou → primeira resposta → terminou → PDF gerado → PDF baixado → fundador / indicou. A contagem por etapa e **onde cada um parou**.
4. **Lista de sessões:** apelido, origem, estado, tempo total, número de "não sei", custo em USD, sinal (fundador, indicou, pagaria) e uma marca "precisa revisar" (passo 06, limite de tentativas).
5. **Sessão:**
   - a transcrição inteira com latências e marcadores;
   - o Corpus resultante, com a origem de cada Metric e a âncora;
   - as tentativas de Selection com as violações;
   - o PDF e o "antes × depois";
   - o fechamento;
   - um campo de **notas do Daniel** (nova coluna `sessoes.notas_daniel`, numa migração própria) para anotar onde o produto errou.
6. **Agregados para o preço:** custo médio, mediano e máximo por sessão, separado por etapa; tempo mediano de interrogatório; as âncoras que mais levaram a número (`ancora` agrupada); as perguntas depois das quais a pessoa mais abandonou (a última mensagem do assistente das sessões paradas).
7. **Gerar token** pela tela também (atalho do `token:new`).

## Fora do escopo

Gráficos elaborados (tabela basta), exportar CSV, múltiplos admins.

## Pronto quando

- [x] Sem cookie, `/admin` e as suas rotas de API respondem 401, incluindo o download de PDF
- [x] Com as sessões simuladas do passo 05/06 no banco, todos os números do topo batem com uma contagem manual em SQL (anote a query nas notas)
- [x] Uma sessão apagada aparece só como "apagada em <data>, estava em <estado>", sem conteúdo

## Notas de implementação

**Estado:** feito. `npm test` (172 passaram, 4 pulados: a integração do import sem chave), `npm run typecheck` e `npm run build` passam. Nenhuma chamada paga ao modelo.

- **Rotas:** `/admin` (critério, funil, lista, agregados, gerar link), `/admin/sessoes/[id]` (a sessão) e `GET /admin/sessoes/[id]/pdf[?selection=<id>]`. O PDF sem `selection` é o entregue; com `selection`, o de qualquer tentativa da sessão. Abrir pelo painel não grava `pdf_baixado`.
- **Acesso (`src/admin/acesso.ts`, `src/admin/servidor.ts`):**
  - `ADMIN_TOKEN` com **≥ 16 caracteres**. Sem ele, ou com um mais curto, o painel fica fechado para todo mundo.
  - O cookie `sem_sotaque_admin` é httpOnly, `SameSite=Strict`, `path=/admin`, `Secure` em produção e vale 30 dias. Ele guarda um HMAC-SHA256 de um rótulo fixo, com o token como chave, e nunca o token em si. Trocar o `ADMIN_TOKEN` desloga todo mundo. A comparação é em tempo constante.
  - As páginas e as Server Actions chamam `exigirAdmin()`, que usa `unauthorized()` do Next. Para isso ligamos **`experimental.authInterrupts`** no `next.config.ts`. A resposta é 401 com o formulário de token (`src/app/admin/unauthorized.tsx`).
  - A rota do PDF lê o cookie do `Request` (`requisicaoAutorizada`) e responde 401 antes de ler qualquer coisa.
  - A checagem não fica no layout: o layout não roda de novo a cada navegação e renderiza em paralelo com a página.
  - `/admin` sai com `no-store`, `noindex` e `no-referrer` (`next.config.ts`).
  - Não há limite de tentativas no formulário: o token precisa ser longo e aleatório.
- **Migração `0006_painel`:** só `ALTER TABLE "sessoes" ADD COLUMN "notas_daniel" text`. Ela já foi aplicada no banco de dev.
- **`apagarSessao` mudou em duas coisas:**
  1. Limpa `notas_daniel`, porque a nota pode citar o que a pessoa disse.
  2. O evento `apagou` agora leva `dados.etapas`: os tipos de evento que a sessão tinha alcançado (só os nomes, sem conteúdo).

  Assim, quem apagou continua contando em todas as etapas por onde passou, como pediam os achados dos passos 02 e 03. Um `apagou` antigo, sem `etapas`, cai nas colunas de `sessoes`.
- **Como uma etapa conta (`src/admin/funil.ts`, testado sem banco em `funil.test.ts`):**
  - A cadeia `link_aberto → consentiu → importou → primeira_resposta → terminou → pdf_gerado` é monotônica. Uma sessão conta numa etapa se tem o evento dela **ou o de uma etapa posterior**, ou se `consentiu_em`, `terminou_interrogatorio_em` ou o estado dizem que sim. As colunas sobrevivem ao apagar, e as simulações nunca abrem o link (não têm `link_aberto`).
  - `pdf_baixado` e "fundador ou indicou" contam cada um por si, e os dois implicam `pdf_gerado`.
  - Fundador vem de `fechamento.fundador` ou do evento `fundador`. Indicou vem de uma linha em `indicacoes` ou do evento `indicou`. O passo 07 confirmou estas formas: `fundador` uma vez, `indicou` com `{ quantas }`.
  - "Onde parou" é a etapa mais adiantada. Apagar exige a página aberta, então implica `link_aberto`.
- **Critério:** os testers são todas as linhas de `sessoes`, apagadas incluídas. As metas são `ceil(0,6 × N)` e `ceil(0,4 × N)`, ou seja, 6 e 4 quando N = 10.
- **Conferência em SQL (Pronto quando 2):** no banco de dev, com as 15 sessões simuladas, mais 4 inventadas para cobrir os caminhos que as simulações não cobrem (uma fundadora, uma que indicou, uma apagada depois de consentir e uma que nunca abriu), o topo mostrou 19 / 18 / 18 / 16 / 2. A query abaixo deu o mesmo. Só com as 15 simuladas: 15 / 15 / 15 / 14 / 0. As 4 inventadas foram removidas depois.

  ```sql
  with s as (
    select s.id, s.estado, s.consentiu_em, s.terminou_interrogatorio_em, s.apagada_em,
      array(select distinct e.tipo::text from eventos e where e.sessao_id = s.id)
        || array(select jsonb_array_elements_text(e.dados->'etapas') from eventos e
                 where e.sessao_id = s.id and e.tipo = 'apagou' and jsonb_typeof(e.dados->'etapas') = 'array') as tipos,
      exists(select 1 from fechamento f where f.sessao_id = s.id and f.fundador) as fundador,
      exists(select 1 from indicacoes i where i.sessao_id = s.id) as indicou
    from sessoes s
  )
  select
    count(*) as testers,
    count(*) filter (where cardinality(tipos) > 0 or apagada_em is not null or consentiu_em is not null or estado <> 'novo') as link_aberto,
    count(*) filter (where consentiu_em is not null or estado <> 'novo'
      or tipos && array['consentiu','importou','primeira_resposta','terminou','pdf_gerado','pdf_baixado','fundador','indicou']) as consentiu,
    count(*) filter (where terminou_interrogatorio_em is not null or estado in ('gerando','pronto','encerrado')
      or tipos && array['terminou','pdf_gerado','pdf_baixado','fundador','indicou'] or fundador or indicou) as terminou,
    count(*) filter (where fundador or indicou or tipos && array['fundador','indicou']) as fundador_ou_indicou
  from s;
  ```
- **Lista de sessões:**
  - "Tempo total" vai da primeira à última atividade (eventos fora o `apagou`, mais as mensagens).
  - "Não sei" conta as mensagens com o marcador `nao_sei`.
  - O custo soma `chamadas_llm` da sessão.
  - O sinal mostra fundador, indicou (com quantas) e `pagaria`.
  - "Precisa revisar" é `geracoes.revisar`. A lista também mostra "erro na geração" quando `geracoes.erro` está preenchido.
- **Agregados:**
  - **Custo** por etapa (import, interrogatório, seleção, crítico, reescrita, geração somada e sessão inteira): média, mediana e máximo, só entre as sessões com chamada naquela etapa. À parte, o custo sem sessão (`sessao_id` nulo, das apagadas).
  - **Tempo de interrogatório:** da primeira mensagem a `terminou_interrogatorio_em`.
  - **Âncoras:** `lower(btrim(ancora))` das metrics `estimado`, agrupadas.
  - **Abandono:** a última pergunta das sessões em `interrogando` sem mensagem há mais de 24 h (`PARADA_APOS_MS`), com o registro de que ela tratava.
- **Página da sessão:**
  - **Apagada:** só "Apagada em <data>, estava em <estado>", com o estado vindo de `apagou.dados.estado`. Nada mais é consultado.
  - **Ativa:** notas; custo por etapa e eventos agrupados por tipo; a transcrição com latência, marcadores e o registro de cada pergunta; o Corpus (affiliations com período, confidencial, descrição pública e stack; accomplishments com metrics, origem, âncora e valores).
  - **Tentativas:** cada uma com checagens, medida, crítico, notas, `preenchimento_insuficiente`, `mantidas`, o texto da Selection e o PDF dela. No topo vêm "o que o crítico perguntou e o Corpus não respondeu", tirado das `mantidas` da tentativa entregue (achado do passo 06).
  - Por fim, o PDF entregue com o antes × depois e o fechamento com as indicações.
- **Antes × depois:** reaproveita o `AntesDepois` da tela da pessoa. A única mudança em `resultado.tsx` foi o `export` (combinado com o passo 07, que mexe no mesmo arquivo).
- **Gerar link:** é o `criarTester` do `token:new`, com "indicado por" escolhido entre os testers ativos. O link usa o `APP_URL` ou, sem ele, o host da requisição, e aparece uma vez só.
- **CSS:** fica em `src/app/admin/painel.css`, importado pelo layout do admin, e usa as mesmas variáveis do `globals.css`. Ficou separado para não conflitar com o passo 07 no `globals.css`.
- **Testes:**
  - `src/admin/funil.test.ts` (sem banco).
  - `src/admin/acesso.test.ts` (sem banco).
  - `src/db/painel.test.ts` (banco): a rota do PDF dá 401 sem cookie e com cookie errado, 200 com cookie, 404 para a tentativa de outra sessão, e não grava download. Também cobre a linha do painel com marcadores, custo, sinal e revisar; a sessão apagada com `etapas`, sem notas e recusando nota nova; as âncoras agrupadas; e a última pergunta de uma sessão parada.

  Rodado com `TEST_DATABASE_URL=postgres://sem_sotaque:sem_sotaque@localhost:5432/sem_sotaque_test_08`.
- **Conferido no app** (`next build && next start -p 3008`, banco de dev, Chromium headless pelo playwright-core fora do repo):
  - sem cookie, `/admin`, `/admin/sessoes/<id>`, `.../pdf` e `.../pdf?selection=` respondem 401; com cookie, 200, e 404 para uma tentativa inexistente;
  - token errado mostra o erro; o certo entra com cookie httpOnly/Strict/`/admin`;
  - gerar link e salvar notas sobrevivem ao recarregar; "Sair" volta ao 401;
  - sem rolagem horizontal a 375 px.

## Achados

- **Server Action sem cookie:** `exigirAdmin()` chama `unauthorized()` dentro de `gerarToken` e `salvarNotas`. Não testei por HTTP, porque o id da action só existe no build. O caminho é o mesmo das páginas.
- **`unauthorized()` é experimental** no Next 16.1.6 (`experimental.authInterrupts`). Se uma versão futura mudar a API, a alternativa é um `proxy.ts` em `/admin/:path+`.
- **Simulações contam como testers.** No banco de produção não haverá nenhuma, mas no de dev elas dominam o critério. Se o Daniel testar em produção com uma sessão de ensaio (passo 09), ela entra no denominador. Um filtro por `origem` (ou apagar a sessão de ensaio) resolve.
- **As âncoras são texto livre do modelo** ("quantos motoristas usavam o app... (de memória, sem dashboard)"), então o agrupamento por texto quase não junta nada. Para o agrupamento servir ao preço, a tool `registrar_metric` precisaria de uma âncora de uma lista fechada (usuários, frequência, antes/depois, time, custo da falha), como diz o `CONTEXT.md`.
- **"Tempo total"** de uma sessão regerada (`npm run gerar --de-novo`) vai até o `pdf_gerado` novo, que pode cair horas depois do interrogatório.
- **Tempo de interrogatório das simulações:** 5 min de mediana, porque a persona responde em 2–3 s. Não serve para estimar o tempo de uma pessoa de verdade; só os testers servem.
- **Um `apagou` antigo**, de antes deste passo, sem `etapas`, numa sessão `interrogando` não conta em `primeira_resposta`: a coluna de estado não diz se a pessoa chegou a responder. Hoje não há nenhum.
- O seletor "indicado por" lista todos os testers ativos, com repetição de apelido (as simulações). Basta com 10 testers.
