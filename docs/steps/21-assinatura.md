# 21: Assinatura

## Objetivo

Sem assinatura ativa, nada abre. A pessoa assina pelo Stripe Checkout, gere a assinatura pelo Customer Portal, e o app só liga e desliga o acesso pelo webhook. As vagas passam a ter cota por trimestre.

## Ler antes

- `docs/decisoes.md`, "Parte 3" (Q12, Q13, Q16, Q17, Q18, Q20)
- As notas do passo 20
- `src/db/vagas.ts` (`criarVaga`, `limite_vagas`) e `src/db/geracao.ts` (o limite de 3 versões)
- A documentação do Stripe (Billing, Checkout em modo `subscription`, Customer Portal, webhooks e a verificação de assinatura) e a do SDK `stripe` na versão instalada

## Decisões (grilling de 2026-10-28)

1. **Stripe Billing**, cartão, um Price em BRL: **R$ 99/trimestre**, preço de beta travado enquanto a assinatura estiver ativa (Q12, Q17). Conta Stripe no CNPJ do Daniel; nota fiscal à mão (Q13).
2. **Paywall antes de começar** (Q16): sem assinatura `active` ou `trialing`, a casa mostra só a tela de assinar.
3. **15 vagas por trimestre**, zerando na renovação; 3 versões por vaga continuam (Q18). Apagar vaga não devolve cota.
4. **Cancelar** pelo portal: o acesso vai até o fim do período pago. **Reembolso** dos 7 dias: à mão, no dashboard do Stripe; o webhook de reembolso corta o acesso (Q20).
5. **Apagar a conta cancela a assinatura na hora**, sem reembolso fora dos 7 dias, e o botão diz isso antes (Q20).

## Fazer

1. **Migração:** `assinaturas` (conta, `stripe_customer_id`, `stripe_subscription_id`, status, `periodo_inicio`, `periodo_fim`, atualizada em). O webhook é a única fonte do status.
2. **O webhook** (`/api/stripe/webhook`): assinatura verificada, idempotente pelo id do evento (`eventos_stripe` com o id único). Trata `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed` e `charge.refunded`.
3. **Assinar:** a tela de assinar cria a Checkout Session (com `client_reference_id` = conta) e redireciona. **Gerir:** um link para o Customer Portal na casa.
4. **O acesso:** uma função só (`temAcesso(conta)`) usada em cada página e ação do passo 20. **No `MODO=local` ela devolve sempre verdadeiro**, por `modo()` (`src/modo.ts`, passo 23), com um teste.
5. **A cota:** a contagem de vagas passa a ser "vagas criadas dentro de `periodo_inicio`–`periodo_fim`", com 15 de limite. O texto do limite diz quando zera. **O `local` não tem limite** (`limite_vagas = SEM_LIMITE_DE_VAGAS`, passo 23): a cota nova não pode valer para ele.
6. **Medir o custo de uma vaga** (conversa e uma geração) com `npm run gerar -- <persona> --vaga ...` **pela assinatura** (`MODO=local LLM_BACKEND=assinatura`, custo zero, só tokens; o guarda do passo 23 recusa a assinatura sem `MODO=local`). Se for preciso o número em US$, pela API: **peça o sim do Daniel com o custo estimado antes**. Anote nas notas e diga se as 15 vagas cabem em R$ 99.
7. **O texto novo** (assinar, o preço, "Gerenciar assinatura", o limite do trimestre, o aviso do apagar) segue `docs/regras-de-redacao.md` e vai para o Daniel antes de aplicar.
8. **As variáveis** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`) em `docs/deploy.md` e no `.env.example`. Teste local com `stripe listen`.

## Fora do escopo

Pix, boleto, cupom, recompensa por indicação, nota fiscal automática. A página de venda (passo 25).

## Pronto quando

- [x] Em modo de teste, uma conta assina com o cartão `4242…`, o webhook grava `active` e a casa abre. (Pela API, com `pm_card_visa`; a página da Checkout ficou para um navegador, ver as notas.)
- [x] Cancelar pelo portal mantém o acesso até `periodo_fim`; `customer.subscription.deleted` corta (teste com eventos fixos).
- [x] O mesmo evento entregue duas vezes não muda nada (teste).
- [x] Um webhook com assinatura inválida dá 400 (teste).
- [x] A 16ª vaga do trimestre é recusada e a renovação devolve a cota (teste).
- [x] Apagar a conta cancela a assinatura no Stripe (teste com o SDK falso).
- [x] O custo de uma vaga está nas notas.
- [x] `npm run typecheck` e `npm test` passam.

## Notas de implementação

- **Branch e PR:** `daniel-bernardino747/issue-11-passo-21-assinatura`, em commits teste → código, com PR para a `main`.
- **SDK:** `stripe` 23.1.0 (API `2026-10-28.endive`). Desde a `basil`, o período fica no item da assinatura (`items.data[0].current_period_start/end`), não na assinatura; a fatura aponta a assinatura em `parent.subscription_details.subscription`; a Checkout Session limita o meio de pagamento com `allowed_payment_method_types` (o `payment_method_types` não existe mais no tipo).
- **A porta do Stripe** (`src/assinatura/stripe.ts`): `Cobranca` com quatro chamadas (`assinatura`, `cancelar`, `checkout`, `portal`), em termos do app. Os testes trocam por `cobrancaFalsa()` (`src/assinatura/falso.ts`, com os eventos fixos e `assinarConta()`, que passa uma conta pelo paywall) via `usarCobranca()`. `daStripe()` converte a assinatura do SDK.
- **Migração `0015_assinaturas.sql`:** `assinaturas` (uma por conta, `conta_id` como chave, `on delete cascade`: some com a conta; o Stripe guarda o histórico), `eventos_stripe` (o id do evento como chave) e `limite_vagas` com padrão 15, mais um `UPDATE` que leva os 10 do v0 a 15 (um limite que o painel subiu fica como está). Rodei no banco de dev.
- **O webhook** (`/api/stripe/webhook`, `src/assinatura/webhook.ts`): a assinatura do Stripe confere o corpo cru (`Stripe.webhooks.constructEvent`); sem cabeçalho, com outro segredo ou com o corpo alterado, dá 400. **Nenhum evento é a fonte do estado:** cada um aponta uma assinatura, e ela é relida do Stripe na hora (o Stripe não garante a ordem). Evento repetido não faz nada: o id entra em `eventos_stripe` na mesma transação da escrita, e antes um `select` evita a chamada ao Stripe. Erro ao tratar dá 500 e o Stripe reenvia. A conta vem do `client_reference_id`, senão do `metadata.conta_id` (a Checkout grava em `subscription_data.metadata`), senão da linha que já tem a assinatura. No `MODO=local`, 404.
- **Uma linha por conta:** uma assinatura nova (depois de outra encerrada) substitui a linha e zera o reembolso. Evento atrasado de uma antiga não mexe na nova. **Duas assinaturas vivas** (duas Checkouts pagas ao mesmo tempo) não se substituem: a linha fica com a primeira e o log de erro diz qual cancelar e reembolsar (ver Achados).
- **`situacao()`** (`src/db/assinaturas.ts`): `ativa` (`active`/`trialing`, sem reembolso), `pendente` (`past_due`, `unpaid`, `incomplete`, `paused`: arruma o cartão no portal, nunca uma segunda assinatura) e `sem` (nunca assinou, `canceled`, `incomplete_expired` ou reembolsada). **`temAcesso(conta)`** (`src/assinatura/acesso.ts`) é `situacao === 'ativa'`, e no `local` sempre verdadeiro (teste em `src/conta/modo-local.test.ts`).
- **O acesso nas rotas:** `entradaAtual()` e `sessaoComAcesso()` em `src/conta/servidor.ts`. `sessaoDaRota()` (páginas, PDFs, `vagaDaRota`) manda para `/casa` sem acesso; o chat geral, o da vaga e o `fim` dão **402**; as ações (`sessaoDaAcao`) mandam para `/casa`. Ficam fora do paywall: "Sair", "Apagar meus dados", `assinar` e `gerirAssinatura`. A `/casa` sem acesso mostra só `SemAcesso`: a tela de assinar; "Recebi o seu pagamento" (com `?assinatura=ok`, recarrega a cada 3 s até o webhook chegar); ou "O pagamento não passou" (com o portal).
- **Reembolso** (`charge.refunded` com `refunded: true`, isto é, integral): corta o acesso (`reembolsada_em`) e **cancela a assinatura no Stripe** antes de gravar, para o trimestre seguinte não ser cobrado. Se o cancelamento falha, o evento não é gravado e o Stripe reenvia. O `cancelar` real relê a assinatura e não faz nada se ela já acabou. Reembolso parcial não muda nada. **As duas regras não estavam no passo: o Daniel confirma.**
- **A cota** (`cotaDeVagas`, `criarVaga`, em `src/db/vagas.ts`): com assinatura, contam as vagas criadas **desde `periodo_inicio`**, sem limite em cima. Uma vaga criada depois do `periodo_fim` e antes do webhook da renovação conta no trimestre velho: nunca sai de graça. Sem assinatura (o `local`, com `SEM_LIMITE_DE_VAGAS`; um Tester do v0), contam todas, como antes. As apagadas contam. `vagasCriadas` (todas de sempre) continua sendo o que soma no teto de gasto por sessão.
- **Apagar a conta** (`apagarDados`, agora com `useActionState`): `cancelarAntesDeApagar` cancela a assinatura viva no Stripe na hora (`invoice_now: false`, `prorate: false`), e só então apaga. Se o Stripe falha, nada é apagado e o formulário diz isso. A linha de `assinaturas` some em cascata com a conta.
- **Assinar** (`assinar`): uma Checkout Session (`mode: subscription`, o Price, cartão, `locale: pt-BR`, `client_reference_id` = conta, o e-mail da conta ou o `customer` de uma assinatura anterior) e o redirect. Recusa uma segunda com a assinatura `ativa` ou `pendente`. **Gerir:** "Gerenciar assinatura" no rodapé da moldura abre o Customer Portal, com qualquer assinatura (as encerradas também, pelas faturas).
- **Textos aprovados pelo Daniel em 2026-11-03,** todos como propostos: a tela de assinar, "Recebi o seu pagamento", "O pagamento não passou", "Gerenciar assinatura", o limite do trimestre ("Você ainda pode colar N vagas neste trimestre. A contagem volta a zero em 3 de fevereiro." / "Você usou as 15 vagas deste trimestre"), sem o botão do WhatsApp, e o aviso do apagar com a assinatura.
- **Variáveis:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `STRIPE_PRICE_ID` estão em `docs/deploy.md` (com o passo a passo do produto, do webhook, do portal e do reembolso) e no `.env.example`.
- **Verificação em modo de teste (2026-11-03).** Usei as chaves `sk_test_` do `.env` do Daniel, `stripe listen --api-key … --forward-to localhost:3005/api/stripe/webhook` e o `next dev` na 3005 (sem login no CLI: o `--api-key` basta). A extensão do Chrome não estava conectada, então **a página da Checkout não foi clicada.** A assinatura foi criada pela API, com `pm_card_visa` (o `4242…`) e `metadata.conta_id`, numa conta inventada criada por script. Resultado:
  - `/casa` mostrava a tela de assinar;
  - o webhook gravou `active` (período até 2027-02-03) e a casa abriu (no consentimento);
  - `cancel_at_period_end` manteve `active` e a casa aberta;
  - o cancelamento gerou `customer.subscription.deleted`, a linha foi para `canceled` e a casa voltou à tela de assinar;
  - todos os eventos encaminhados tiveram 200, e a `checkout()` real devolveu uma URL `checkout.stripe.com`.

  **Falta** pagar uma vez pela página da Checkout num navegador (o `checkout.session.completed` real e o `success_url`).
- **Testes:**
  - `src/assinatura/webhook.test.ts`, com eventos fixos: assinar, cancelar no fim do período, `deleted`, fora de ordem, repetido, renovação, falha de pagamento, reembolso integral e parcial, assinatura nova depois de uma encerrada, segunda viva;
  - `rota.test.ts`: 400 de assinatura inválida, 404 no `local`, 500 com o Stripe fora;
  - `cota.test.ts`: a 16ª recusada, e a renovação devolve a cota;
  - `apagar.test.ts`: cancela antes de apagar; com o Stripe fora, nada some;
  - `assinar.test.ts` e `src/conta/paywall.test.ts`.

  `npm test`: 500 passaram, 4 pularam. `npm run typecheck` e `npm run build` passam (todas as rotas de `/casa` são ƒ).

**O custo de uma vaga** (item 6) foi medido pela assinatura (`MODO=local LLM_BACKEND=assinatura`, sem a chave do Jev): `npm run simular -- vaga`, depois `npm run gerar -- vaga --sessao 07618c48-… --vaga 474f545b-…`. Os tokens vêm de `chamadas_llm`, e o preço é o de `src/llm/precos.ts`, conferido na skill `claude-api`. O Opus 5.5 custa US$ 4 por milhão de tokens de entrada, US$ 20 de saída e US$ 0,20 de cache lido; a escrita no cache de 5 min sai a 1,25×, US$ 5.

| Etapa | Chamadas | Saída | Cache lido | Cache escrito | US$ |
|---|---|---|---|---|---|
| leitura da vaga | 1 | 876 | 0 | 4.133 | 0,04 |
| conversa da vaga (20 turnos) | 48 | 20.746 | 518.974 | 79.030 | 0,91 |
| mapa | 1 | 1.229 | 0 | 3.120 | 0,04 |
| seleção | 1 | 2.241 | 0 | 9.881 | 0,09 |
| crítico (3 tentativas) | 3 | 2.881 | 12.288 | 10.070 | 0,11 |
| reescritas | 2 | 3.797 | 6.523 | 13.207 | 0,14 |
| **a vaga inteira** | | | | | **≈ US$ 1,34** |

A geração foi aprovada na 3ª tentativa, em 137 s, com preenchimento de 46% (o fixture `pleno.txt` tem pouca história). A conversa é quase 70% do custo: sem ela (só ler, mapear e gerar), a vaga sai por ≈ US$ 0,43. Cada versão a mais (até 3) custa ≈ US$ 0,35.

**A cota de 15 contra o custo medido** é conta do negócio e ficou fora do repo público.

## Achados

- **Duas Checkouts pagas ao mesmo tempo** (duas abas, ou o "voltar" antes do webhook). A `assinar` só recusa quem já tem a assinatura gravada. A segunda assinatura viva não substitui a primeira e vai para o log de erro (`two live subscriptions`). Mas ela continua cobrando até o Daniel cancelar e reembolsar à mão, e "Apagar" não a cancela. Como a primeira Checkout de uma conta usa `customer_email`, as duas viram dois customers. Para fechar: criar o customer na primeira `assinar` e checar no Stripe se ele já tem assinatura viva antes da Checkout.
- **Corrida de escrita no webhook:** a assinatura é relida do Stripe antes da transação, e o lock vem depois. Dois eventos da mesma assinatura ao mesmo tempo podem gravar por último a foto mais velha. O próximo evento corrige; uma trava por assinatura (advisory lock) fecharia.
- **`incomplete` prende a pessoa** até o Stripe expirar a assinatura (~23 h). Ele conta como `pendente`, o portal não termina um primeiro pagamento e a `assinar` recusa outra Checkout. É raro com cartão na Checkout (um 3DS abandonado).
- **A página da Checkout não foi testada num navegador:** falta uma compra de ponta a ponta com o `4242…` na 3000, com o `stripe listen`.
- **"R$ 99" e "15 vagas" estão escritos no texto** da tela de assinar, mas o preço de verdade é o Price no Stripe. Quem mudar um tem que mudar o outro.
- O `MODO=local` é perguntado em sete lugares do código de cobrança (`temAcesso`, `cancelar.ts`, `assinar`, `gerirAssinatura`, a rota do webhook, a moldura). Funciona, mas uma regra nova de cobrança tem que lembrar de todos.
- **O limite de 3 currículos por vaga** ainda oferece "chamar o Daniel no WhatsApp" (`curriculo-da-vaga.tsx`), o texto do teste.
- **Um limite subido no painel** (`limite_vagas`) agora vale por trimestre, não para sempre.
