# 17: O currículo da vaga

## Objetivo

"Gerar agora" produz um currículo em inglês para aquela vaga, pelo mesmo pipeline do geral (seleção, checagens, crítico, reescritas, PDF), mais o **Mapa da vaga**: cada requisito → a linha do currículo que o responde, ou "não coberto". É o "currículo por vaga" que a decisão 3 chama de recorrência.

## Ler antes

- `docs/decisoes.md`, "Parte 2", e `CONTEXT.md` (Versão, Mapa da vaga)
- As notas dos passos 14 a 16
- `src/geracao/` inteiro: `pipeline.ts`, `prompt-selecao.md`, `prompt-critico.md`, `prompt-reescrita.md`, `checagens.ts`, `regras.md`, `cabecalho.ts`
- `src/render/document.ts` e `resume.ts` (`header.role` e `summary`)
- A skill `generate` do `../career` (só leitura): filtro pelo cargo da vaga, peso pelos registros, o crítico contra a vaga e o arquivo de entrevista por linha
- `docs/regras-de-redacao.md`

## Decisões (grilling de 2026-10-26/27)

1. **O título** (`header.role`, P18) é o cargo da vaga sem a senioridade, só se o Corpus o sustentar; senão, o cargo que a pessoa teve de verdade. **O summary** mira os pedidos principais da vaga, e o que o Corpus não tem continua ausente.
2. **A seleção recebe a vaga:** os requisitos com peso (obrigatório antes de desejável) e as respostas "não usei". Lacuna sem resposta conta como "não usei"; rascunho sem Metric fica de fora (P11).
3. **O mapa sai de uma leitura inteira da versão entregue** (P22). O crítico de cada tentativa relê só as linhas alteradas depois da primeira (`pipeline.ts:438`), e a versão entregue é a `melhor`, não necessariamente a última (`pipeline.ts:464,489`). Por isso o mapa vem de **uma chamada a mais, depois da entrega**, no papel do crítico (etapa nova `mapa_vaga`), sobre a Selection entregue e a vaga. Ela devolve:
   - o mapa: cada requisito → o `accomplishment_id` da linha que o responde, ou "não coberto";
   - as perguntas de entrevista, **guardadas e não mostradas** (a prep de entrevista é Premium, P12).

   O crítico das tentativas recebe a vaga só para julgar a mira (título, summary); um problema dele sobre requisito ausente é descartado no código antes de `bloqueantes` (`pipeline.ts:468`), para não chegar à reescrita com `gravidade: 'alta'`.
4. **O mapa é conferido no código:** todo id citado tem de existir na Selection daquela versão; id inválido vira "não coberto". Nenhum número entra no mapa, só referências.
5. **"Não coberto" nunca volta para reescrita.** O laço de reescrita continua só pelas violações de hoje. Empurrar o redator para cobrir um requisito é o incentivo para inventar.
6. **Versões por vaga** (P14): cada geração é uma versão nova; as antigas ficam. **3 gerações por vaga** (P15); no limite, a mensagem de WhatsApp.
7. **Sempre em inglês** (P16), com o aviso de vaga em português já dado no passo 15.

## Fazer

1. **Geração com `vaga_id`:** a geração do passo 14 ganha `vaga_id` (nulo no currículo geral). O mapa e as perguntas de entrevista ficam na versão (com `sessao_id`, para o teste que varre a coluna). Migração e `apagarSessao`/`apagarVaga` juntos: esvaziar a vaga apaga as versões, o mapa e as perguntas. A entrega grava um evento `vaga_gerada` com `{ vaga_id }` (é a etapa "com currículo" do funil do passo 19).
2. **Os prompts da vaga:** a seleção com a vaga, as regras do título e do summary (decisão 1) e o crítico com a saída do mapa e das perguntas. Os prompts de hoje continuam valendo para o currículo geral; o que for só da vaga fica num bloco condicional ou num arquivo próprio, decidido pelo que deixa o teste mais simples.
3. **As checagens determinísticas novas** em `checagens.ts`: o título não pode ter senioridade; o cargo da vaga só aparece no título se alguma Affiliation tiver cargo equivalente (a regra exata vai nas notas); os ids do mapa existem na Selection.
4. **A tela da vaga pronta:** o PDF da versão, o mapa (requisito, a linha ou "não coberto"), o histórico de versões e "Gerar de novo" com a contagem de gerações restantes. O PDF em `/s/<token>/vagas/<id>/pdf?v=<n>`.
5. **Custo:** todas as chamadas da geração levam o `vaga_id`.
6. **O texto novo** (rótulos do mapa, "não coberto", o limite de gerações) segue `docs/regras-de-redacao.md` e vai para o Daniel antes de aplicar.
7. **O script `gerar`** aceita `--vaga <id>` para rodar a geração da vaga na sessão simulada.

## Fora do escopo

Mostrar as perguntas de entrevista (Premium). Cover letter. Currículo em português. Status de candidatura (passo 18).

## Pronto quando

- [x] A persona de vaga do passo 16 gera um currículo para a vaga inventada, pela assinatura, com o PDF dentro das regras de página (`measure-resume`) e as checagens de hoje passando.
- [x] O título não tem senioridade e não usa um cargo que o Corpus não sustenta (teste).
- [x] O mapa cita só ids que existem na Selection; um id inventado vira "não coberto" (teste).
- [x] Um requisito "não coberto" não dispara reescrita, nem quando o crítico da tentativa o aponta como problema (teste).
- [x] O mapa é da versão entregue, mesmo quando ela não é a última tentativa (teste).
- [x] A 4ª geração da mesma vaga mostra a mensagem do limite; as versões 1 a 3 continuam abrindo.
- [x] As perguntas de entrevista ficam no banco e não aparecem em nenhuma tela do Tester.
- [x] `npm run typecheck` e `npm test` passam.
- [ ] Uma geração de vaga contra a API real (sim dado em 2026-10-28; não rodou: a `ANTHROPIC_API_KEY` do `.env` deu 401 "invalid x-api-key") **só com o sim do Daniel**, com o custo estimado (~US$ 0,10–0,40 por geração, como a geral, mais a chamada do mapa).

## Notas de implementação

- **Branch e PR:** `ticket/17-curriculo-da-vaga`, em commits de teste → código, com PR para a `main`.
- **Migração:** `0012_curriculo-da-vaga.sql`, gerada pelo drizzle-kit e revisada. `geracoes` ganhou `vaga_id` (FK sem `on delete`), `mapa` e `perguntas_entrevista` (jsonb). A chave única passou de `(sessao_id, versao)` para `(sessao_id, vaga_id, versao)` com `nulls not distinct`: o currículo geral numera por sessão e cada vaga numera a partir de 1. Enums: `etapa_llm` ganhou `mapa_vaga` e `tipo_evento` ganhou `vaga_gerada`. Rodei no banco de dev.
- **Banco (`src/db/geracao.ts`):** `ultimaGeracao`, `criarGeracao`, `curriculoEntregue(sessao, versao?, vagaId)` e `versoesEntregues` recebem `vagaId`; nulo, o padrão, é o currículo geral. Assim nada do geral (a casa, `/curriculo`, `corpusMudou`, o painel) vê as versões das vagas.
  - `criarGeracao` de uma vaga exige a vaga viva e `confirmada` e para em `GERACOES_POR_VAGA = 3`. Há uma geração por vez por currículo, então o geral e o de uma vaga não se bloqueiam.
  - `geracoesRestantes` conta as linhas criadas. Uma geração que falhou e é refeita com "Tentar de novo" conta uma vez.
  - A entrega de uma vaga grava `mapa`, `perguntas_entrevista` e o evento `vaga_gerada` `{ vaga_id, versao, … }`. Ela não grava `pdf_gerado` e nunca mexe no `estado`.
  - O download leva `{ vaga_id }` no `pdf_baixado`.
  - `esvaziar` apaga as `geracoes` da vaga; as selections e os renders saem em cascata. `vaga_gerada` entrou em `EVENTOS_DE_VAGA` e sobrevive a "Apagar meus dados".
  - O painel (`sessoesDoPainel`) lê só a última geração do currículo geral.
- **A regra exata do título** (`checarTituloDaVaga`, regra `cargo_sem_lastro`):
  - Ela só roda numa geração de vaga e só olha o `header.role`.
  - Cada cargo vira uma "área": o texto sem acento, com "back end"/"front-end"/"full stack" colados, sem as palavras de ofício (developer, engineer, desenvolvedor, engenheiro, programador…), sem as de senioridade, sem as de ligação e sem "software". Algumas palavras em português são traduzidas (dados→data, plataforma→platform, infraestrutura→infrastructure, sistemas→software…).
  - O título passa quando a área dele é igual à de algum `cargo` de Affiliation. Um título sem área ("Software Engineer") passa se alguma Affiliation tem uma palavra de ofício. Sem título, passa.
  - Ela não obriga o título a ser o cargo da vaga (isso é do prompt). Ela só garante que nenhum título, nem o da vaga, chega à página sem um cargo que o sustente.
  - A senioridade no título já era barrada por `checarManagerESenioridade`.
- **Pipeline (`pipeline.ts`):** `gerarCurriculo` lê o `vaga_id` da geração.
  - **Seleção:** recebe `<job>` com o cargo, os requisitos (obrigatórios antes dos desejáveis, cada um com os registros que a leitura achou) e `not_used`, que são as lacunas sem "já usei": marcadas "não usei" ou sem resposta.
  - **Crítico:** cada crítico recebe `<job>` sem cobertura e sem `not_used`.
  - **Reescrita:** recebe só o cargo e `not_used`, nunca a lista de requisitos (decisão 5).
  - **Prompts:** o que é só da vaga fica em `prompt-<etapa>-vaga.md`, colado depois do prompt geral. `regras.md` deixou de dizer "there is no job posting".
  - **Passes novos do crítico:** `mira` e `requisito_ausente`. O código descarta `requisito_ausente`. A `mira` só vale em `header_role`/`summary` e **fica sempre `baixa`**: "o summary não fala da maior exigência" é requisito ausente com outro nome. Isso veio da revisão, e as regras do título são das checagens.
  - **Mapa:** depois de escolher a `melhor`, a etapa `mapa` faz uma chamada (`mapa_vaga`, `prompt-mapa.md`, ferramenta `registrar_mapa`) sobre o texto da versão entregue, com os ids de linha. O código traduz `bN` para a fonte do bullet e `gN.stack` para a fonte da linha da stack (com `naStack: true`, para o requisito de tecnologia que só está na stack, como o Terraform da persona). Depois passa por `conferirMapa`: linha fora da página vira não coberto, e requisito que a resposta pulou também. As perguntas ficam com o `accomplishment_id` da linha (nulo para o summary).
  - Se a chamada do mapa falha, a versão é entregue sem mapa, e a tela não mostra a seção.
- **Custo:** toda chamada da geração leva o `vagaId`. `mapa_vaga` entrou em `ETAPAS_DE_GERACAO` (usa a margem).
- **Segundo plano:** `rodando` tem uma chave por currículo (`sessao:vaga` ou `sessao:geral`). As funções são `garantirGeracao(sessao, { deNovo, vagaId })` e `novaGeracao(sessao, vagaId?)`.
- **Telas:**
  - A vaga confirmada mostra, depois da contagem de perguntas, `CurriculoDaVaga`. Os estados são: o formulário do topo (para quem ainda não tem cabeçalho), "Gerar agora", a falha com "Tentar de novo", ou a versão nova. A versão nova traz o PDF, o mapa (requisito sobre a linha, ou "Não coberto"), "Gerar de novo" com as restantes ou a mensagem do limite com o WhatsApp, e as versões anteriores.
  - "Gerar agora" é prata quando não há pergunta em aberto, e vazado quando há.
  - Enquanto gera, a página da vaga é a `Espera`, que ganhou a frase da etapa `mapa`.
  - O PDF fica em `/s/<token>/vagas/<id>/pdf?v=<n>`. Vaga de outra sessão, vaga esvaziada ou versão inexistente dão 404.
  - As ações novas são `gerarParaAVaga`, `enviarCabecalhoDaVaga` e `tentarDeNovoNaVaga`.
  - As perguntas de entrevista não são lidas por nenhuma tela.
- **Script:** `npm run gerar -- vaga --vaga <id>` (a persona `vaga` ganhou um cabeçalho inventado). O relatório traz o mapa e as perguntas.
- **Verificação:**
  - **A rodada:** `LLM_BACKEND=assinatura TYPESAFE_API_KEY= ANTHROPIC_API_KEY= npm run gerar -- vaga --vaga 5752548c-…` (a vaga "Lagoa Payments" da última simulação do passo 16) levou 184 s em 4 tentativas, aprovada, com 0 checagens no entregue, US$ 0. Relatório em `storage/geracoes/vaga-vaga-2026-10-28T13-32-21-822Z.md`, fora do git.
  - **A página:** 1 página, título "Backend Engineer" (a vaga pede "Senior Backend Engineer"). A medida aponta só a página curta (46,8%) e um grupo com 1 bullet. Os dois foram aceitos porque o Corpus da persona é fino: o `simular -- vaga` pula a conversa geral.
  - **O mapa:** Redis → o bullet do cache; Terraform → a linha da stack; pagamentos idempotentes → o bullet das cobranças. Go "5+ years", Kafka, PostgreSQL e Rust ficaram não cobertos.
  - **Os registros:** as 9 chamadas da geração gravaram o `vaga_id`.
  - **A tela:** num build de produção na porta 3002 (o `next dev` das 09:39, que já estava rodando, estava quebrado com "Jest worker encountered 2 child process exceptions" e segurava o lock de `.next/dev`; não o derrubei). A página mostrou o PDF, o mapa e "Dá para gerar mais 2 vezes". `?v=2` e a vaga de outra sessão deram 404. Com duas versões copiadas no banco de dev (apaguei depois), apareceu a mensagem do limite e as versões 1 a 3 abriram.
  - Nenhuma chamada paga.
- **Textos novos, aprovados pelo Daniel em 2026-10-28:**
  - "O currículo para esta vaga";
  - "Antes do primeiro currículo, falta o topo dele: seu nome e como falar com você.";
  - "Gerar agora";
  - "Faço com o que você já me contou, em inglês. O que a vaga pede e você não usou fica de fora: não invento.";
  - "O que a vaga pede e onde está no currículo";
  - "Não coberto";
  - "Não coberto quer dizer que nada do que você me contou mostra isso, e eu não invento. Se você já fez, me conte na conversa e gere de novo.";
  - "Dá para gerar mais uma vez para esta vaga." / "Dá para gerar mais N vezes para esta vaga.";
  - "Você já gerou 3 currículos para esta vaga, o limite deste teste. Se precisar de outro, me chame no WhatsApp." + "Chamar o Daniel no WhatsApp" (mensagem pronta: "Oi, Daniel! Cheguei no limite de currículos para uma vaga no sem-sotaque e queria gerar mais um.");
  - "Não consegui terminar o currículo desta vaga";
  - a frase da espera: "Ligando cada pedido da vaga à linha do currículo que responde a ele…".

## Achados

- **Apagar a vaga durante a geração:** as `geracoes` somem, e a rodada só para na próxima escrita (`gravarTentativa` recusa). Até lá ela continua chamando o modelo. Nada é entregue nem fica para trás, mas gasta.
- **A versão sem mapa** (a chamada do mapa falhou) conta para as 3 gerações, e a tela não diz que o mapa falta.
- **O mapa diz "não coberto" para um requisito composto** ("5+ years building backend services in Go") mesmo com bullets em Go. É honesto (anos não são Metric), mas pode confundir. Talvez valha mostrar o tipo (obrigatório/desejável) ou separar "parcial".
- **A persona de vaga sai com a página curta** (46,8%), porque o `simular -- vaga` pula a conversa geral. Para julgar a página cheia, vale rodar a vaga numa sessão com a conversa geral feita (`sabe-os-numeros`).
- **As perguntas de entrevista saem em inglês.** A skill `generate` guarda as de Daniel na língua dele. Decidir quando a prep virar Premium.
- **Duplicações da revisão que não mexi:** a rota do PDF da vaga repete a do geral (a leitura de `v`, os cabeçalhos), e o bloco do PDF na tela repete `resultado.tsx`. Um componente/função comum fica para quando houver um terceiro uso.
- **O `next dev` antigo quebrado:** depois de trocar de branch com o servidor de pé, ele passou a dar 500 em toda rota ("Jest worker…"). Reiniciá-lo resolve.
