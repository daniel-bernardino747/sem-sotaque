# 25: Lançamento do beta

## Objetivo

O hospedado no domínio próprio, com Stripe em modo real e OAuth de produção, a página de venda no ar, e o repo público anunciado no mesmo dia.

## Ler antes

- `docs/decisoes.md`, "Parte 3" (Q10, Q16, Q17, Q20, Q22, Q23)
- As notas dos passos 09 e 20 a 24, e `docs/deploy.md`

## Decisões (grilling de 2026-10-28)

1. **Domínio:** `semsotaque.teamdbsolutions.com` (Q22).
2. **A página de venda** (Q16): a promessa, um "antes × depois" de uma pessoa inventada (os fixtures; nunca dado de tester), R$ 99/trimestre de beta travado, "não gostou em 7 dias, devolvemos tudo", e o "ou rode na sua máquina" com o link do repo.
3. **Hospedado e código aberto no mesmo dia** (Q23).

## Fazer

1. **O domínio** no Coolify (DNS, certificado) e `APP_URL` trocado.
2. **OAuth de produção:** os apps do GitHub e do Google com o domínio, o link da política e dos termos (o Google pede), e as variáveis no Coolify.
3. **Stripe em modo real:** o Price de R$ 99/trimestre, o webhook do domínio, o Customer Portal configurado (cancelar no fim do período, trocar cartão, faturas), e os termos e a política na conta.
4. **A página de venda** na `/` do `hospedado`. O texto vai para o Daniel antes de aplicar.
5. **Ensaio em produção, com o Daniel:** uma assinatura real com cartão dele, uma sessão até o PDF, uma vaga, cancelar no portal, reembolsar no dashboard, apagar a conta. Anote tempos e o que quebrou.
6. **Os links antigos:** os testers do v0 recebem a mensagem de que o link agora pede login. O texto vai para o Daniel.

## Fora do escopo

Anúncio nas redes (o Daniel faz). Candidaturas (18) e o painel das vagas (19), que vêm depois.

## Pronto quando

- [ ] `https://semsotaque.teamdbsolutions.com` responde com certificado válido e a página de venda.
- [ ] O ensaio do item 5 passou de ponta a ponta em produção.
- [ ] O repo público está linkado na página de venda e no rodapé.
- [ ] O Daniel decidiu que dá para anunciar. **Pergunte a ele** e anote a data nas notas deste passo.

## Notas de implementação

**Estado em 2026-11-04** (o passo segue em andamento; o resto é trabalho de console do Daniel):

- **Item 1, o domínio:** feito. `https://semsotaque.teamdbsolutions.com/health` dá 200 com certificado válido.
- **Item 2, OAuth de produção:** feito em 2026-11-04. Um OAuth App do GitHub próprio de produção (o "sem-sotaque (dev)" continua para `localhost`) e um cliente Web do Google, com a tela de consentimento publicada. Conferido de fora: o `/entrar` mostra os dois botões, e os dois provedores aceitam o client id e o `redirect_uri` (o Google vai para a escolha de conta, sem `redirect_uri_mismatch`). A volta, a troca do code pela conta, só se testa entrando de verdade (ensaio). **Pegadinha do Coolify:** variável nova só vale depois de um redeploy e marcada para runtime; antes disso, `/api/auth/<provedor>` volta para `/entrar?erro=1`.
- **Item 3, Stripe em modo real:** feito em 2026-11-04 (o Price, o Portal, `STRIPE_*` no Coolify, e o webhook como "event destination" com os 7 eventos de `docs/deploy.md`). Conferido de fora: um evento sem assinatura válida recebe 400 (sem o `STRIPE_WEBHOOK_SECRET`, seria 500). O Checkout de verdade só se testa logado (ensaio).
- **`CONTATO_WHATSAPP`:** conferir no Coolify. Sem ela, o link de "mais versões" da vaga abre um e-mail.
- **Item 4, a página de venda:** feita, com o texto aprovado pelo Daniel em 2026-11-04 (`src/app/page.tsx`, `src/app/pagina-de-venda.test.ts`).
  - O "antes × depois" é do Rodrigo, a persona inventada (`scripts/personas.ts`, `sabe-os-numeros`). O "antes" vem do `src/llm/__fixtures__/pleno.txt`; o "depois" é a saída real de `npm run gerar -- sabe-os-numeros` de 2026-10-14, sem edição. Saíram as linhas do currículo do Daniel.
  - Saíram o convite, o "teste fechado e grátis" e o "perdi o meu link". O selo e a barra fixa (`BarraConvite` virou `BarraAssinar`, em `src/app/barra-assinar.tsx`) mandam para `/entrar`, e o paywall fica na casa, depois do login. O `Balao`, o ícone do WhatsApp, deixou de ser usado e saiu.
  - A página saiu do `noindex`: o beta é público. Se a ideia for segurar a busca até o anúncio, basta pôr de volta o `robots: { index: false, follow: false }` no `metadata`.
  - Conferida a 360 e a 390 px (Playwright, com o Chrome do sistema): sem rolagem horizontal. O `next dev` com Turbopack quebra no Windows com o `next/font/google` ("queries have exactly one entry"); para ver localmente, use `next dev --webpack`.
- **Item 6, a mensagem para os testers do v0:** o rascunho aprovado dizia que o link antigo levava tudo para a conta, e isso é verdade, mas a conta sem assinatura cai no paywall (`temAcesso`, `src/assinatura/acesso.ts`): os testers também pagam. **Decidido pelo Daniel em 2026-11-04:** os testers do v0 pagam como todo mundo, sem acesso de cortesia e sem mudança de código. O texto aprovado, que o Daniel manda:

  > Oi! O sem-sotaque mudou: agora ele tem login com GitHub ou Google, e saiu do teste grátis para um beta pago (R$ 99 por trimestre, 7 dias para desistir). O seu link antigo vale uma vez: abra, entre com uma das duas contas, e o que você já fez fica guardado na sua conta. Depois, é só entrar por semsotaque.teamdbsolutions.com. Valeu por ter testado no começo!

- **Item 5, o ensaio em produção:** depende dos itens 2 e 3.
- **O passo 09** segue em andamento. O ensaio que falta nele (sessões até o PDF, apagar, o tempo de render) cabe dentro do ensaio do item 5.

## Achados

(o que aparecer fora do escopo)
