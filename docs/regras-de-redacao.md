# Regras de redação

Portadas do `career` (as skills `generate`, `capture` e `interrogate`, `references/bullets.md` e as correções do Daniel registradas entre 2026-09-29 e 2026-10-14). No produto, ninguém corrige à mão o que escapa. Por isso, **cada regra diz como é garantida**:

- **código**: uma checagem determinística sobre a Selection ou o PDF. Se falha, o modelo reescreve com a violação listada.
- **prompt**: só o modelo garante. O crítico confere.
- **campo**: vira dado do Corpus ou preferência da conta.

Os exemplos ruim → bom estão em `../career/.claude/skills/generate/references/bullets.md`. Leia esse arquivo antes de escrever o prompt de geração.

## Universais (padrão do produto, não editáveis no v0)

| Regra | Garantia |
|---|---|
| **Nunca inventar um fato ou número.** Todo bullet cita o `accomplishment_id` de onde veio; todo número do bullet aparece numa Metric daquele registro | código (número do bullet ⊂ números das Metrics da fonte) + prompt |
| **Estimativa leva `~` e nunca diz quem estimou** ("estimativa do cliente", "por estimativa minha" não entram) | código (lista de expressões de atribuição) |
| **STAR.** Situação curta, o que a pessoa fez de particular, o resultado | prompt + crítico |
| **Explicar todo nome próprio** para um recrutador estrangeiro (empresa, cliente, sistema interno) | prompt + crítico ("recrutador que não sabe nada") |
| **Cliente pelo peso de mercado** (participação, ranking, alcance), nunca pela idade ("55+ anos") | prompt + crítico |
| **Sem adjetivo vazio** ("mission-critical", "robust") que não diga o que há por trás | código (lista) + crítico |
| **Sem hedge no lugar do verbo** ("helped to", "while coding", "single-handedly", "alone", "assisted"). Liderar e codar é ser dono do verbo do sistema ("Re-engineered", "Migrated"). O escopo se estreita pelo objeto, e só quando outra pessoa foi dona de uma parte | código (lista de hedges) + prompt |
| **O primeiro bullet de cada grupo ancora o escopo** (o que o sistema é, a escala, o papel) | prompt + crítico |
| **Um bullet, uma história.** Dois bullets nunca dividem o mesmo produto, e nenhum bullet abre com o nome do produto como rótulo em negrito; a descrição do produto é o storytelling | código (no máximo um bullet por `accomplishment_id`; `label` só na stack line) |
| **Registro longo, bullet curto.** O Corpus guarda o cenário completo; o bullet tem o verbo, um número e o como mais curto | código (linhas por bullet, abaixo) + prompt |
| **Contagem de partes nunca é resultado** ("9 of 10 modules", "30 screens") | código (padrão `\d+ (of \d+ )?(modules|screens|pages|files|endpoints|telas|módulos)`) + prompt |
| **Bullets de engenharia para vaga de engenharia.** Registro de gestão fica fora; nunca "Manager" no título | código (palavra "Manager" no cargo) + prompt |
| **Ferramenta vai na stack line**, e no bullet só como parte da ação | prompt + crítico |
| **Stack line em ordem de fluxo:** linguagem → front end → back end → dados → testes → infra/entrega | prompt |
| **Período em mês/ano** ("Oct 2025 - Oct 2026"). Sem mês no Corpus, o interrogatório pergunta; nunca chuta. Se a pessoa não confirmar, sai o ano que veio no currículo ("2019 - 2021"), nunca um mês chutado; formação sai pelo ano de conclusão ("2018", "Expected 2027") (passo 10) | código (regex no período) + interrogatório |
| **≥ 3 bullets por grupo de Experience** (sem contar a stack line), sem teto. Cada bullet cabe em 2 linhas; no máximo 2 por grupo com 3 linhas; nenhum com 4 | código (`measure-resume.py`) |
| **Sem órfã:** última linha de um bullet com 1–2 palavras | código (`measure-resume.py`) |
| **Uma página cheia** (97–100% da área útil), preenchida com mais bullets curtos e nunca com bullets mais longos | código (`measure-resume.py`). Ver "Em aberto" em [`decisoes.md`](decisoes.md#em-aberto): pessoa com pouca história |
| **Ordem das seções:** Experience primeiro; Projects só para preencher (são os primeiros a sair); voluntariado nunca; Education por último; nenhuma seção de "competências técnicas" | código (ordem e nomes das seções) |
| **Crítico no fim:** um agente de contexto limpo, o "recrutador que não sabe nada", lê o currículo, aponta o que não entendeu e o que soa vazio, e faz um passe de prosa. Qualquer linha alterada passa pelo crítico de novo | pipeline |

## Específicas de uma pessoa (viram campo)

| Origem no `career` | No produto |
|---|---|
| "Nunca nomear a CAIXA" | Campo da Affiliation: `confidencial: true` + `descricao_publica` ("Brazil's largest home-mortgage bank"). O interrogatório pergunta se a empresa ou o cliente pode ser nomeado |
| Peso (`flagship`/`core`/`minor`) é julgamento do Daniel | O interrogatório pergunta à pessoa o que mais importa para ela; nunca é inferido da quantidade de números |

## Discutíveis (preferências da conta, ligadas por padrão)

| Regra | Padrão | Garantia |
|---|---|---|
| Sem senioridade no cargo, no cabeçalho ou no resumo ("Junior", "Mid-Level", "Pleno", "Senior") | ligada | código (lista) |
| Sem disponibilidade (remoto, PJ, contrato, horário, fuso) no currículo | ligada | código (lista) |

No v0 não há tela de preferências: as duas ficam ligadas.

## Fora do v0

LinkedIn, GitHub, cover letter (que tem a sua própria regra: o "por que quero a vaga" vem só do que a pessoa disse), currículo PT e a prep de entrevista.
