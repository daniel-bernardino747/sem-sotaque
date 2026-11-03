# Deploy

A app roda numa VPS com **Coolify**, ao lado de um Postgres 16 do próprio Coolify, na rede interna do Docker. Cada push na `main` dispara um deploy (GitHub App do Coolify). Ninguém faz deploy à mão.

## Como o Coolify builda

- **Build pack: Dockerfile** (o `Dockerfile` da raiz), não Nixpacks: a imagem traz o Tectonic, o `pdftotext` e o `pypdf`, e já sai com o cache do Tectonic aquecido (um render do fixture no build, ~2 min).
- Node **24.22.1**, fixado no `Dockerfile` (`ARG NODE_VERSION`), no `.nvmrc` e no `engines` do `package.json`. Ao subir a versão, mude os três juntos.
- Dentro da imagem: `npm ci` → `npm run build` → `next start` (o `CMD`, direto, sem `npm start`), na porta **3000** e em `0.0.0.0` (`ENV PORT=3000 HOSTNAME=0.0.0.0`). No Coolify: "Ports Exposes" = `3000`.
- **Pre-deployment command:** `npm run db:migrate`. Ele aplica as migrações pendentes de `drizzle/` com o migrator do `drizzle-orm` e só precisa de `DATABASE_URL`. É idempotente: rodar de novo, sem migração nova, não faz nada.
- **Healthcheck:** `GET /health` na porta 3000. Responde `200 {"ok":true}` quando a app alcança o banco, e `503` quando não. Não chama Anthropic nem Typesafe. A imagem tem `curl`, que o Coolify usa para checar.
- No `SIGTERM` do Coolify, o `next start` (PID 1) termina as requisições abertas e sai com 0, em ~1 s.

## Variáveis

| Variável | Obrigatória | O que é |
|---|---|---|
| `DATABASE_URL` | sim | A URL **interna** do Postgres do Coolify (`postgres://…@<host>:5432/<db>`). SSL não é exigido; se um dia for, acrescente `?sslmode=require` à URL |
| `APP_URL` | sim | URL pública, sem barra no fim (`https://semsotaque.teamdbsolutions.com`). Vira o prefixo dos links dos testers (`/s/<token>`) e dos callbacks do OAuth |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | sim | O OAuth App do GitHub (passo 20). Callback: `APP_URL/api/auth/callback/github` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | sim | O cliente OAuth "Web application" do Google Cloud. Redirect URI autorizado: `APP_URL/api/auth/callback/google` |
| `ANTHROPIC_API_KEY` | sim | A API do modelo |
| `TYPESAFE_API_KEY` | sim | O classificador do avaliador (`src/avaliador/jev.ts`) |
| `ADMIN_TOKEN` | sim | O painel `/admin`. Com menos de 16 caracteres, o painel fica fechado |
| `STRIPE_SECRET_KEY` | sim | A chave secreta do Stripe (`sk_live_…`; em teste, `sk_test_…`). Só o servidor a lê (`src/assinatura/stripe.ts`) |
| `STRIPE_WEBHOOK_SECRET` | sim | O segredo do endpoint do webhook (`whsec_…`), que confere a assinatura de cada evento. Sem ele, o webhook dá 500 e o Stripe reenvia |
| `STRIPE_PRICE_ID` | sim | O Price único: R$ 99, recorrente, a cada 3 meses (`price_…`) |
| `TETO_SESSAO_USD` | não | Teto de gasto por sessão. Vazio: US$ 3 |
| `CONTATO_WHATSAPP` | não | O número que os links de convite da landing e o "chamar no WhatsApp" abrem, só dígitos, com o 55 (`src/app/contato.ts`). Vazio: os links mandam e-mail para hello@teamdbsolutions.com |

`NODE_ENV=production` e `PORT=3000` vêm do `Dockerfile`. `LLM_BACKEND` fica **vazia** em produção (o backend `assinatura` é só local e recusa `NODE_ENV=production`).

## Os apps de OAuth (passo 20)

Um app por provedor e por ambiente: o de dev aponta para `http://localhost:3000`, o de produção para o domínio. Um provedor sem as duas variáveis some do `/entrar`.

- **GitHub:** Settings → Developer settings → OAuth Apps → New OAuth App. Homepage: `APP_URL`. Authorization callback URL: `APP_URL/api/auth/callback/github`. O app pede `read:user` e `user:email` (o e-mail privado vem de `/user/emails`).
- **Google:** Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application. Authorized redirect URI: `APP_URL/api/auth/callback/google`. Escopos `openid profile email`. A tela de consentimento OAuth mostra o domínio: configure com `semsotaque.teamdbsolutions.com` antes de publicar o app.

O cookie de login (`sem_sotaque_conta`) é httpOnly, `sameSite=lax`, `secure` em produção, 30 dias, e não precisa de segredo: guarda um valor aleatório, e o banco só o SHA-256 dele (`acessos`).

## O Stripe (passo 21)

Conta no CNPJ do Daniel. O app só cria a Checkout Session e a sessão do portal; o resto mora no Stripe, e o acesso liga e desliga pelo webhook.

1. **Produto e preço:** Product catalog → um produto ("sem-sotaque") com **um** Price: R$ 99,00, BRL, recorrente, a cada 3 meses. O id vai em `STRIPE_PRICE_ID`.
2. **Webhook:** Developers → Webhooks → Add endpoint `APP_URL/api/stripe/webhook`, com os eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` e `charge.refunded`. O signing secret vai em `STRIPE_WEBHOOK_SECRET`.
3. **Customer Portal:** Settings → Billing → Customer portal: ligar, com "cancelar" **no fim do período** (não "imediatamente"), atualizar cartão e ver faturas. Sem trocar de plano (há um Price só). O link de volta é `APP_URL/casa` (o app manda o dele em cada sessão).
4. **Reembolso dos 7 dias:** à mão, no dashboard (Payments → o pagamento → Refund, integral). O `charge.refunded` corta o acesso e cancela a assinatura, para o trimestre seguinte não ser cobrado. Reembolso parcial não muda o acesso.
5. **Cartão só:** a Checkout Session limita a `card` (`allowed_payment_method_types`); Pix e boleto ficam para depois.

**Teste local:** com o Stripe em modo de teste (`sk_test_…` e um Price de teste no `.env`), `stripe listen --forward-to localhost:3000/api/stripe/webhook` imprime o `whsec_…` da sessão: ponha-o em `STRIPE_WEBHOOK_SECRET` e suba o `npm run dev`. Assine com o cartão `4242 4242 4242 4242` (qualquer data futura e CVC). `stripe trigger customer.subscription.updated` e afins disparam eventos, mas de assinaturas que não são de conta nenhuma: o app só os registra.

O `MODO=local` não tem pagamento: nada disso vale, e `/api/stripe/webhook` dá 404.

## Migração manual

Na VPS, dentro do container da app: `npm run db:migrate`. De fora, com a URL do banco: `DATABASE_URL=… npm run db:migrate`.
