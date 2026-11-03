# 07: Fim da sessão (fundador, indicação, depoimento)

## Objetivo

Depois do PDF, coletar os sinais do critério de validação: a pré-venda de fundador e a indicação, mais o depoimento e o "pagaria?". Tudo opcional e sem atrapalhar o download.

## Ler antes

- `docs/decisoes.md` ("O v0")
- `CONTEXT.md` (Fundador, Indicação)

## Fazer

Uma seção abaixo do PDF, na tela de resultado, em PT, curta:

1. **Fundador:** "Quando isso virar produto (currículo por vaga, prep de entrevista em inglês), vai custar <o preço do produto> por trimestre. Quem testou agora garante <o preço de fundador> por trimestre para sempre." Campos: e-mail e WhatsApp, mais o botão "garantir meu preço". Diga com todas as letras que **não há cobrança agora**. Evento `fundador`.
2. **Indicação:** "Conhece outro dev que está tentando vaga lá fora?" Nome e contato (WhatsApp ou LinkedIn), um ou mais. Evento `indicou`. O Daniel gera o token dessa pessoa com `--indicado-por`.
3. **Pagaria:** "Sem o preço de fundador, você pagaria <o preço do produto> por trimestre por isso + currículo por vaga?" Opções: sim / não / talvez, e "quanto pagaria?" em texto livre opcional.
4. **Depoimento:** um texto livre opcional: "o que achou?" Com um checkbox **separado e desmarcado**: "pode usar meu depoimento com meu nome para divulgar". Sem o checkbox, o texto serve só para o Daniel.
5. Um campo "algo deu errado ou ficou estranho?" (`comentario`).
6. Estado `encerrado` quando a pessoa envia ou sai da seção. Ela continua podendo baixar o PDF e apagar os dados.

## Fora do escopo

Cobrança, envio de e-mail, automação de convite para os indicados.

## Pronto quando

- [x] Tudo grava em `fechamento` e `indicacoes` e gera os eventos (`src/db/fechamento.test.ts`)
- [x] Sem preencher nada, o PDF continua acessível (mesmo arquivo: sair da seção, baixar o PDF, apagar)
- [x] O consentimento do depoimento vem desmarcado e é independente do da entrada (teste) (`src/sessao/fechamento.test.ts` e `src/db/fechamento.test.ts`)
- [x] Funciona em celular (Chrome headless a 375 px, com toque; ver notas)

## Notas de implementação

**Estado:** feito. Nenhuma chamada ao modelo neste passo: não há custo novo.

- **Sem migração.** O schema do passo 02 já tinha `fechamento`, `indicacoes`, os eventos `fundador`/`indicou` e o estado `encerrado`. Nada mudou no schema nem em `drizzle/`.
- **Dados (`src/db/fechamento.ts`):**
  - `garantirFundador` grava `fundador = true`, o e-mail e o WhatsApp. O evento `fundador` sai **uma vez por sessão**, sem `dados`. Se a pessoa mandar de novo, os contatos são atualizados e o evento não se repete.
  - `registrarIndicacoes` grava uma linha por pessoa em `indicacoes` e um evento `indicou` por envio, com `{ quantas }`: o nome nunca vai para o evento.
  - `gravarOpiniao` grava `pagaria`, `pagaria_quanto`, `depoimento`, `depoimento_pode_usar` e `comentario`. Um envio novo substitui o anterior.
  - `encerrarSessao` faz `pronto` → `encerrado` e mais nada.
  - `fechamentoDaSessao` devolve a linha e quantas indicações há, para a tela.
  - As três escritas só gravam com a sessão em `pronto` ou `encerrado` e não apagada (`for update`). Fora disso devolvem `false` e não gravam nada. O **primeiro envio** já move a sessão para `encerrado`.
- **Leitura dos formulários (`src/sessao/fechamento.ts`):**
  - `lerFundador` exige os dois contatos, porque o Fundador do `CONTEXT.md` deixou e-mail e WhatsApp. O WhatsApp precisa ter de 10 a 15 dígitos.
  - `lerIndicacoes` ignora linha toda vazia e recusa linha pela metade. Aceita no máximo 10 pessoas por envio.
  - `lerOpiniao` aceita qualquer subconjunto das respostas, desde que pelo menos uma venha preenchida. `depoimento_pode_usar` só fica `true` com a caixa marcada **e** um depoimento escrito. O campo da entrada (`aceito`) nunca conta.
- **Tela:** `_telas/fim-da-sessao.tsx` (servidor) e `_telas/fim.tsx` (cliente) formam uma seção `#fim` no fim da tela de resultado, depois do antes × depois. Embaixo dos botões do PDF há um link-âncora: "Antes de ir: umas perguntas rápidas, todas opcionais".
  - São três formulários independentes: fundador, indicação e opinião. A opinião junta o "pagaria", o depoimento e o comentário.
  - Cada formulário usa `useActionState` e **não faz redirect**, para a tela comprida não pular para o topo. Depois de enviado, o formulário vira uma confirmação. Ao recarregar, a confirmação vem do banco.
  - A indicação continua aberta para mandar mais gente.
  - O e-mail do fundador vem preenchido com o do cabeçalho (`geracoes.email`).
  - A seção diz "**Não há cobrança agora.**" antes do botão, e "Nada foi cobrado" depois.
- **"Sai da seção":** o `SaidaDaSecao` só é montado em `pronto`. Depois que a seção apareceu na tela (`IntersectionObserver`), `visibilitychange` → `hidden` ou `pagehide` mandam um `navigator.sendBeacon` para `POST /s/[token]/fim` (`fim/route.ts`), que chama `encerrarSessao`. Quem abre a página e sai sem rolar até a seção continua em `pronto`.
- **`encerrado` não tira nada:** a tela continua a mesma (`telaDoEstado`), o PDF continua em `/s/[token]/pdf` e "apagar meus dados" continua no rodapé. Os formulários ainda aceitam envio em `encerrado`.
- **Conferido no app:** `next build && next start -p 3007`, contra o banco `sem_sotaque_test_07`, com uma sessão inventada em `pronto`. Chrome headless pelo `playwright-core` (fora do repo), a 375 px, `isMobile` e toque. O fluxo:
  1. Erro do WhatsApp mostrado no formulário.
  2. Fundador garantido.
  3. Duas indicações, com "+ mais uma pessoa".
  4. "Talvez", o "quanto", o depoimento com a caixa desmarcada e o comentário.

  Não houve rolagem horizontal, e as três confirmações continuaram depois de recarregar. O beacon também foi conferido: quem saiu sem ver a seção ficou em `pronto`, quem rolou até ela e saiu foi para `encerrado`.
- **Para o passo 08:** o critério "fundador ou indicou" pode ler os eventos ou `fechamento.fundador` e `count(indicacoes)`. O "pagaria" está em `fechamento.pagaria`. Só use o depoimento como divulgável com `depoimento_pode_usar`.

## Achados

- **`indicacoes.virou_tester_id` não é preenchido por ninguém.** O `token:new --indicado-por <token>` grava `testers.indicado_por`, mas não liga a linha de `indicacoes` ao Tester novo. Para o funil de indicação, um `--indicacao <id>` no script, ou a ligação à mão no painel, resolveria.
- **O beacon também dispara quando a pessoa troca de app** depois de ver a seção, por exemplo ao abrir o PDF no leitor do celular. A sessão vira `encerrado` antes de ela terminar de responder. Isso não atrapalha, porque `encerrado` ainda aceita os envios, mas `encerrado` quer dizer "chegou ao fim e saiu ao menos uma vez", e não "terminou de responder". Não há evento para `encerrado` (o enum não tem); o painel lê `sessoes.estado`.
- **O antes × depois quebra com uma Selection que não passou pelo `selectionSchema.parse`.** Num grupo sem `entries`, como o Education do `sample-selection.json`, `g.entries.filter` lança erro. Pelo pipeline isso não acontece, porque `gravarTentativa` faz o parse, que aplica o default `[]`. Um seed ou uma correção à mão no banco, porém, derruba a tela.
- **`/favicon.ico` dá 404** (de antes deste passo): é o único erro no console da página.
