# 19: O painel das vagas

## Objetivo

O Daniel vê o que a parte 2 precisa provar: se as pessoas voltam para uma segunda vaga, se o currículo por vaga leva a entrevista e quanto custa uma vaga. "Enviei → Em entrevista" é a primeira métrica de resultado do produto; o custo por vaga é o número que define o limite do Base.

## Ler antes

- `docs/decisoes.md`, "Parte 2"
- As notas dos passos 08, 15 a 18
- `src/app/admin/` inteiro, `src/admin/painel.ts`, `src/admin/funil.ts` e `src/db/painel.ts`

## Decisões (grilling de 2026-10-26/27)

1. **Por sessão** (P20): uma seção "Vagas" na página da sessão. Para cada vaga: o texto, os requisitos e as lacunas com as respostas "usei / não usei", os rascunhos trazidos, as versões geradas (com o mapa e as perguntas do crítico, que a pessoa não vê), o histórico de status e o custo.
2. **No índice:** o funil das vagas (criadas → com currículo → enviadas → em entrevista → proposta), os motivos de encerramento e o custo médio e máximo **por vaga**.
3. **O limite de vagas** (P15) se aumenta na página da sessão.

## Fazer

1. As consultas em `src/db/painel.ts`, com testes, contando as vagas esvaziadas pelas linhas delas (`apagada_em`), pelo histórico de status e pelos eventos com `{ vaga_id }`, que sobrevivem ao apagar (passos 15 e 18).
2. A seção "Vagas" na página da sessão e o funil no índice, no padrão do painel de hoje (só os tokens da cédula, sem ornamento).
3. A ação de aumentar o `limite_vagas`.
4. O custo por vaga soma as chamadas com aquele `vaga_id`; as de "custo não medido" (assinatura) aparecem contadas à parte, como hoje.

## Fora do escopo

Exportar dados. Gráficos além das tabelas e cartões de hoje.

## Pronto quando

- [ ] A página de uma sessão simulada mostra a vaga dela com requisitos, versões, mapa, perguntas do crítico, histórico e custo.
- [ ] O funil do índice conta uma vaga apagada nas etapas por que ela passou (teste).
- [ ] O custo médio e máximo por vaga bate com a soma de `chamadas_llm` (teste).
- [ ] Aumentar o limite de uma sessão deixa ela criar a 11ª vaga.
- [ ] O painel a 360px sem scroll lateral.
- [ ] `npm run typecheck` e `npm test` passam.

## Notas de implementação

(preencher ao terminar)

## Achados

(o que aparecer fora do escopo)
