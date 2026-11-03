# 16: A conversa da vaga

## Objetivo

As lacunas marcadas "já usei" e os rascunhos que a leitura trouxe viram perguntas, no mesmo interrogatório do chat geral. O que sai delas (um Accomplishment com Metric ou uma tecnologia na stack de uma Affiliation) entra no **Corpus geral**, e não só na vaga.

## Ler antes

- `docs/decisoes.md`, "Parte 2", e `CONTEXT.md` (Assunto, Lacuna, Fila aberta)
- As notas dos passos 14 e 15
- `src/avaliador/plano.ts` inteiro, `src/avaliador/index.ts`, `src/interrogatorio/turno.ts`, `ferramentas.ts` e `prompt.md`
- A skill `generate` do `../career` (só leitura): as perguntas sobre o que a vaga pede e nenhum registro cobre, e as respostas gravadas como captura no Corpus

## Decisões (grilling de 2026-10-26/27)

1. **O mesmo motor e o mesmo componente** (P25), com a fila restrita à vaga. Assuntos podem pertencer a uma vaga. Turno, avaliador (Jev) e fechamento funcionam como hoje.
2. **O que entra na fila da vaga:** cada lacuna "já usei" e até 5 rascunhos relevantes, escolhidos na mesma chamada da leitura (P10).
3. **Uma lacuna "já usei"** termina como um Accomplishment (com Metric, ou rascunho se não houver número) ou como uma tecnologia acrescentada à stack de uma Affiliation. O questionador pergunta onde e como a pessoa usou; o objetivo sai do mesmo template de hoje.
4. **O resultado vai para o Corpus geral** (P10). O currículo geral passa a mostrar "Seu Corpus mudou".
5. **A fila da vaga fica na vaga:** uma lacuna "já usei" que ainda não virou registro conta no "N perguntas em aberto" da vaga e **não aparece** na Fila aberta do chat geral. Depois que ela vira Accomplishment, ele é Corpus como qualquer outro: se ficar rascunho, aparece também na Fila aberta geral. Os rascunhos trazidos pela vaga já são do Corpus e aparecem nas duas filas. Quando a fila da vaga acaba, a tela volta para a página da vaga, com "Gerar agora".
6. **"Gerar agora" sempre disponível** (P11), com o número de perguntas em aberto. Lacuna sem resposta conta como "não usei"; rascunho sem Metric fica de fora.

## Fazer

1. **Assunto com `vaga_id`:** os tipos novos (lacuna, rascunho trazido pela vaga) em `plano.ts`, e o estado do plano por vaga (o `plano` hoje tem `sessao_id` como chave, `schema.ts:420`: uma linha por sessão e por vaga, ou uma fila por vaga dentro dele; decida pelo que deixa o teste mais simples e registre nas notas).
2. **`mensagens` ganha `vaga_id`.** O histórico (`mensagensDaSessao`), `perguntasDesde`, `ultimoCheckpoint` e a trava `emSerie` são por sessão hoje: o chat da vaga mostraria o histórico do geral e vice-versa. Filtre todos pela vaga (nulo = conversa geral). Ao esvaziar uma vaga, as mensagens dela são apagadas (elas podem citar a empresa); o que viraram no Corpus fica.
3. **O contexto do questionador** para uma lacuna: o texto do requisito, as Affiliations com a stack delas e o objetivo. Ele continua sem ver o resto da vaga e os outros assuntos (decisão 5 do passo 10).
4. **A ferramenta para acrescentar stack** a uma Affiliation, se a de hoje não cobrir, com a checagem do servidor de que a Affiliation existe.
5. **A rota do chat da vaga** dentro de `/s/<token>/vagas/<id>`, com o mesmo componente do chat geral e a contagem em aberto na página da vaga.
6. **A pseudonimização do Jev** continua valendo: a empresa da vaga entra em `protegidos().organizacoes` (`src/avaliador/pseudonimo.ts`), para ser trocada por "Empresa X" antes do envio e recusada por `conferirPayload` se escapar.
7. **Uma persona de vaga** em `scripts/personas.ts` (inventada), com uma vaga inventada e duas lacunas que ela usou, para o script `simular`.

## Fora do escopo

Gerar o currículo da vaga (passo 17). Mudar o avaliador além da fila por vaga.

## Pronto quando

- [x] Uma vaga com duas lacunas "já usei" e um rascunho trazido faz as perguntas na ordem (lacunas, depois o rascunho) e volta para a página da vaga no fim.
- [x] O Accomplishment criado aparece no Corpus geral e no aviso "Seu Corpus mudou".
- [x] A Fila aberta do chat geral não mostra uma lacuna da vaga que ainda não virou registro (teste).
- [x] O chat da vaga mostra só as mensagens dela, e o chat geral só as gerais (teste).
- [x] O payload enviado ao Jev traz "Empresa X" e nunca o nome da empresa da vaga; um vazamento é recusado (teste).
- [x] A persona de vaga roda pela assinatura sem número inventado (as checagens do passo 05).
- [x] `npm run typecheck` e `npm test` passam.
- [x] Desenvolvido com `LLM_BACKEND=assinatura`. Qualquer rodada contra a API vai antes para o Daniel, com o custo estimado.

## Notas de implementação

- **Branch e PR:** feito em `ticket/16-conversa-da-vaga`, em commits de teste → código (red-green), com PR para a `main`. Os passos anteriores foram commitados direto na `main`.
- **Migração:** `0011_conversa-da-vaga.sql`, gerada pelo drizzle-kit. O `DROP CONSTRAINT "plano_pkey"` foi escrito à mão, porque o drizzle-kit não sabe o nome da chave. `mensagens.vaga_id` e `decisoes_avaliador.vaga_id` são FK sem `on delete`. O `plano` ganhou `id` e `vaga_id`, com `unique nulls not distinct (sessao_id, vaga_id)`: uma linha para a conversa geral (`vaga_id` nulo) e uma por vaga. Escolhi **uma linha por vaga** em vez de uma fila dentro do plano geral: todo o avaliador já lê e grava "um plano", e assim só ganhou o `vagaId`. Rodei a migração no banco de dev.
- **Banco:** `mensagensDaSessao`, `planoDaSessao`, `gravarPlano` e `decisoesDaSessao` recebem `vagaId` (nulo = conversa geral). `falasDaSessao` devolve tudo o que a pessoa disse em qualquer conversa: a checagem de números vale para a **sessão**, então um número dito na conversa geral vale na vaga, e vice-versa. `atualizarCobertura` atualiza a cobertura do plano geral depois de um checkpoint da vaga, para a casa mostrar o Corpus que mudou. Ao esvaziar uma vaga, as mensagens e o plano dela são apagados; as decisões ficam, porque o `motivo` é um template. "Apagar meus dados" já apagava tudo por `sessao_id`.
- **Plano (`plano.ts`):** tipo de Assunto novo `lacuna` (o id é o do Requisito) e o gatilho `stack`, que sempre troca de assunto. `Contexto.vaga = { lacunas, rascunhos }` faz o `ordem` devolver a fila da vaga: as lacunas "já usei" na ordem da vaga, depois os rascunhos trazidos que ainda estão sem resultado (até os pulados na conversa geral), e por fim as anotações. **O rascunho trazido não ganhou um tipo próprio:** é um assunto `accomplishment`, e todas as ferramentas e regras de hoje valem para ele. Uma lacuna feita vai para `visitados` (`lacuna:<id>`). Um rascunho aberto pela vaga vai para `retomados` e não volta nela (o plano da vaga nunca é retomado, então `retomados` não zera).
- **Avaliador:** `carregar(sessaoId, vagaId)` lê a vaga, monta a fila e põe a empresa da vaga nos `protegidos`. A conversa da vaga roda como uma retomada (`retomada = emRetomada || vagaId`). `abrirConversaDaVaga` cria o plano (sem o Jev: a força já foi julgada na conversa geral) e abre o primeiro da fila; `perguntasEmAberto` conta a fila mais o assunto atual, se ainda está aberto. Na vaga não há oferta de fim, e abrir um adiado não gasta o `adiadoVoltou` da conversa geral. O Jev recebe o `vagaId`: a linha de custo leva a vaga, e o teto dele soma o orçamento das vagas, igual ao cliente Claude (decisão 7 do passo 15).
- **Pseudonimização:** `protegidos({ ..., vaga })` dá à empresa da vaga o rótulo "Empresa X", e as organizações do Corpus usam as letras sem o X. Se a vaga é numa empresa do Corpus (mesmo nome), ela fica com o rótulo de lá.
- **Turno:** `turno(..., { vagaId })` passa a usar só as mensagens e o plano da vaga, e aceita também `gerando`. O fim volta para a vaga com `DESPEDIDA_DA_VAGA`, sem `encerrarInterrogatorio`; o teto usa `DESPEDIDA_DO_TETO_NA_RETOMADA`. O questionador vê o texto do Requisito e as empresas (`emprego`) com a stack, e nada mais da vaga (`descreverAssunto`). O `prompt.md` ganhou a seção "Uma lacuna da vaga".
- **Ferramentas:** a nova `acrescentar_stack({ empresa, tecnologias })` só funciona numa lacuna e só aceita uma empresa (`emprego`) que existe, pelo nome sem acento; recusa outra. `criar_accomplishment` e `criar_affiliation` também valem numa lacuna.
- **Trava:** **um desvio do "Fazer" 2**, que pedia filtrar a trava `emSerie` pela vaga. A trava continua **por sessão**: a conversa geral e a da vaga escrevem o mesmo Corpus (`pulado`, a cobertura, o plano geral), e um turno de cada ao mesmo tempo perderia escrita. Um turno da vaga numa aba faz a outra aba receber 409 e recarregar. `apagarVaga` e "Responder às perguntas" também passam pela trava.
- **Rotas:** `_chat.ts` tem o `turnoEmFluxo` (o corpo do antigo `chat/route.ts`) e o tipo `EventoChat`. As rotas são `/vagas/<id>/chat` (POST: 404 para vaga de outra sessão ou esvaziada, 409 antes de `confirmada`) e `/vagas/<id>/conversa` (o mesmo `Conversa`/`Chat`, com `rotuloVolta` "Voltar para a vaga"; sem assunto aberto, redireciona para a vaga). A página da vaga confirmada mostra "Responder às perguntas" (ação `conversarSobreAVaga`) e "N perguntas em aberto". **"Gerar agora" fica para o passo 17.**
- **Persona:** `vaga` em `scripts/personas.ts`: o Rodrigo do `pleno.txt` e uma vaga inventada da "Lagoa Payments", com Redis (vira registro) e Terraform (vira stack) como lacunas usadas e Rust como não usada. O `simular` pula a conversa geral, cola a vaga, lê com `lerEGravar`, marca "já usei" as lacunas que citam o que a persona usou e joga a conversa da vaga. Ele roda sem `TYPESAFE_API_KEY` (só na persona de vaga): o avaliador usa as regras de reserva.
- **Verificação:** `LLM_BACKEND=assinatura TYPESAFE_API_KEY= ANTHROPIC_API_KEY= npm run simular -- vaga --turnos 40` levou 4,9 min, 14 turnos e US$ 0, com todas as checagens OK (transcrição em `storage/simulacoes/vaga-2026-10-28T12-47-18-818Z.md`, fora do git). A ordem foi Redis → registro com Metric 300 → 40 ms; Terraform → stack; os 3 rascunhos trazidos; volta para a vaga. A primeira rodada mostrou a anotação abrindo antes da lacuna do Terraform; foi corrigida (commit `fix: na vaga, a anotação vem depois da fila da vaga`). No dev pela assinatura, a página da vaga mostra o botão e a contagem, a conversa da vaga abre o chat, e vaga de outra sessão dá 404 na página e no chat. A extensão do Chrome não estava conectada, então usei o Chrome headless com `--screenshot` (o headless não desce de ~500 px de largura; a 500 px não há rolagem lateral). Nenhuma chamada paga.
- **Textos novos, aprovados pelo Daniel em 2026-10-28 como estavam:**
  - o botão "Responder às perguntas";
  - "N perguntas em aberto" / "Nenhuma pergunta em aberto";
  - "O que você me contar aqui entra no seu currículo geral e nas próximas vagas também.";
  - "Voltar para a vaga";
  - `DESPEDIDA_DA_VAGA`: "Era isso desta vaga. O que você me contou ficou guardado e vale também para as próximas vagas.";
  - a seção "Uma lacuna da vaga" do `prompt.md`.

## Achados

- **Anotações nas regras de reserva viram registros duplicados.** Sem o Jev, toda anotação vira assunto `anotacao` (`destino: 'nova'`), e o questionador cria um registro para o que já existe. Na simulação, a anotação "está na Maracatu desde mar/2022" virou um segundo registro do cache Redis. Isso vem do motor geral, não da vaga, mas a vaga deixa mais visível. Talvez valha mandar as anotações da vaga para o plano geral, ou, sem o Jev, descartar a anotação em vez de perguntar.
- **A lacuna não guarda o que virou.** O registro criado ou a stack de uma lacuna "já usei" ficam só no Corpus e no `visitados` do plano da vaga; o `requisitos` não sabe. O passo 17 (mapa da vaga) talvez precise ligar lacuna → registro, ou gravar "não usei" quando a pessoa pula.
- **O painel admin mostra só a conversa geral** (`mensagensDaSessao` e `decisoesDaSessao` agora filtram pela conversa). A conversa de cada vaga fica para a seção "Vagas" do passo 19. Já `painel.ts` (durações, "Quem parou") lê `mensagens` direto e mistura as duas conversas.
- **Apagar a vaga apaga as falas por trás de uma Metric** que veio dela. A Metric fica com `origem` (e `ancora`, se estimada), mas a fala que a sustenta some. É o que a decisão 2 pede (as mensagens podem citar a empresa); só registro.
- **Vaga numa empresa com nome parecido com uma do Corpus** ("Maracatu" contra "Fintech Maracatu Pagamentos"): as duas entram nos `protegidos` com rótulos diferentes e uma palavra em comum. Nada vaza, mas o rótulo que aparece depende da ordem.
- **O banco de teste nunca é esvaziado,** e `ultimasPerguntasDasParadas` (`src/db/painel.test.ts`) cresce com ele. Com ~3.300 sessões acumuladas, o teste estourava os 5 s em toda suíte cheia. Recriei o banco (`drop database sem_sotaque_test`; o `test-setup` recria) e a suíte passou. Vai voltar: limpar o banco no `test-setup`, ou dar um índice a essa consulta.
