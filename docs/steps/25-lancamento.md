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

(preencher ao terminar)

## Achados

(o que aparecer fora do escopo)
