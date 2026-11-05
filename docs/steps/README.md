# Passos do v0

Um passo por janela. Cada arquivo é autossuficiente: objetivo, o que ler antes, o que fazer, o que fica fora, "pronto quando" verificável e, ao terminar, as notas para a próxima janela.

| # | Passo | Depende de | Status |
|---|---|---|---|
| 01 | [Fundação: app, render e Docker](01-fundacao.md) | — | feito |
| 02 | [Banco: schema do Corpus e do log](02-banco.md) | 01 | feito |
| 03 | [Acesso: token, consentimento, apagar](03-acesso.md) | 02 | feito |
| 04 | [Import do currículo e cliente LLM](04-import.md) | 02 | feito |
| 05 | [Interrogatório](05-interrogatorio.md) | 03, 04 | feito |
| 06 | [Geração: Selection, checagens, crítico, PDF](06-geracao.md) | 05 | feito |
| 07 | [Fim da sessão: fundador, indicação, depoimento](07-fim.md) | 06 | feito |
| 08 | [Painel do Daniel](08-painel.md) | 05 | feito |
| 09 | [Deploy no Railway e ensaio geral](09-deploy.md) | 06, 07, 08 | em andamento |
| 10 | [Avaliador e assunto por vez](10-avaliador.md) | 05, 06, 08 | feito |
| 11 | [Menos chamadas por sessão](11-custo-por-sessao.md) | 10 | feito (com pendência) |
| 12 | [Backend LLM pela assinatura (só local)](12-backend-assinatura.md) | 04 | feito |
| 13 | [A cédula cobalto em todo o sistema](13-cedula-no-sistema.md) | — | feito |

**Parte 2: a casa, as vagas e as candidaturas** (grilling de 2026-10-26/27; decisões em [`decisoes.md`](../decisoes.md#parte-2-a-casa-as-vagas-e-as-candidaturas)). Nada dela sobe para produção antes de o 09 fechar.

| # | Passo | Depende de | Status |
|---|---|---|---|
| 14 | [A casa da pessoa e as rotas](14-casa-e-rotas.md) | 13 | feito |
| 15 | [A vaga entra](15-vaga-entra.md) | 14 | feito |
| 16 | [A conversa da vaga](16-conversa-da-vaga.md) | 15 | feito |
| 17 | [O currículo da vaga](17-curriculo-da-vaga.md) | 16 | feito |
| 18 | [Candidaturas](18-candidaturas.md) | 17, 25 | pendente |
| 19 | [O painel das vagas](19-painel-das-vagas.md) | 18 | pendente |

**Parte 3: o beta pago e o código aberto** (grilling de 2026-10-28; decisões em [`decisoes.md`](../decisoes.md#parte-3-o-hospedado-e-o-código-aberto)). Vem antes do 18 e do 19. O 09 fecha antes do 25.

| # | Passo | Depende de | Status |
|---|---|---|---|
| 20 | [Contas](20-contas.md) | 17 | feito |
| 21 | [Assinatura](21-assinatura.md) | 20 | feito |
| 22 | [Privacidade, termos e o fim para quem paga](22-privacidade.md) | 21 | feito |
| 23 | [Self-host (`MODO=local`)](23-self-host.md) | 20 | feito (com pendência) |
| 24 | [O código aberto](24-codigo-aberto.md) | 22, 23 | feito |
| 25 | [Lançamento do beta](25-lancamento.md) | 09, 21, 22, 24 | em andamento |

**Paralelo possível:** 03 ∥ 04 (depois do 02) e 08 ∥ 06/07 (depois do 05). Na Parte 3: 23 ∥ 21/22 (depois do 20), e o 09 a qualquer momento. Janelas paralelas devem trabalhar em worktrees ou branches separados e não editar o mesmo arquivo de schema ao mesmo tempo. Se um passo precisar de coluna nova, ele cria uma migração própria.

Status: `pendente` → `em andamento` → `feito`.
