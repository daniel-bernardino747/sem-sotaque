# Decisões

As decisões técnicas do sem-sotaque e o porquê de cada uma. Vieram de três sessões de grilling (2026-10-14, 2026-10-26/27 e 2026-10-28). Os passos de implementação estão em [`steps/`](steps/README.md) e citam as decisões pelo número (decisão 13, P23, Q6).

## O produto

Uma ferramenta web para **dev brasileiro que aplica para vaga internacional, em inglês**. Ela tira o "sotaque brasileiro" do currículo: o dev conta a carreira em português, o produto o interroga até cada experiência ter um resultado defensável e escreve um currículo em inglês nativo.

O diferencial não é "IA que escreve currículo". São duas coisas:
1. **O interrogatório que nunca inventa número** ("20% de quê?", "o que é essa empresa?"). Todo número do currículo é algo que a pessoa afirmou e consegue defender na entrevista.
2. **As regras de redação** (STAR, sem hedge, nome próprio explicado, peso do cliente em vez de idade, etc.). Estão em [`regras-de-redacao.md`](regras-de-redacao.md).

## O v0

| # | Decisão | Por quê |
|---|---|---|
| 3 | **Interrogatório → Corpus → currículo geral → currículo por vaga** | O interrogatório é o difícil de copiar; o "por vaga" traz a pessoa de volta |
| 4 | **Web app** | O público não usa Claude Code, e o "antes × depois" é visual |
| 8 | **Toda chamada ao modelo grava tokens e custo** (`chamadas_llm`), por sessão e por etapa | O custo medido é o que define os limites do plano |
| 9 | **"Não sei o número"** → estimativa guiada por âncoras, confirmada pela pessoa, com `~`. Sem número possível → resultado qualitativo concreto, marcado como fraco, usado só para preencher | Regra rígida gera abandono; número opcional devolve o currículo genérico |
| 11 | **Regras:** as universais viram código e prompt, com checagem determinística sempre que der. As específicas de uma pessoa viram campo do Corpus (ex.: cliente confidencial). As discutíveis (senioridade, disponibilidade) viram preferência, ligadas por padrão | No produto ninguém corrige à mão o que escapa |
| 12 | **Interrogatório e interface em PT, saída em EN.** O Corpus aceita as duas línguas | Em inglês o dev simplifica e esconde justamente o detalhe de que o interrogatório precisa |
| 13 | **Stack:** Next.js 16 + TypeScript, Postgres 16, API da Anthropic, **Tectonic em Docker**, `measure-resume` no pipeline. Em produção, uma VPS com Coolify ([`deploy.md`](deploy.md)) | O motor de origem já era TS; os templates Tectonic já estavam ajustados |
| 14 | **O modelo nunca escreve LaTeX.** Ele produz uma **Selection** (JSON validado: o que entra, em que ordem, com que compressão), e um template fixo a renderiza | O currículo não quebra por um comando inventado, e cada linha continua apontando para o registro de onde veio |
| 15 | **Nenhum número sem origem.** Toda Metric tem `origem` e, se estimada, a `ancora`. Todo bullet cita o seu `accomplishment_id` | É a promessa do produto, conferida pelo código antes do PDF |

**LGPD no v0:** consentimento explícito na primeira tela, um botão real de apagar os dados, nenhum dado de pessoa real em post, demo ou material de venda sem um novo consentimento, e nenhum PDF no git.

## Parte 2: a casa, as vagas e as candidaturas

O link da pessoa deixa de ser um fluxo de mão única e vira a **casa** dela: de lá ela retoma a conversa que alimenta o Corpus, cria um currículo para uma vaga ("Achei uma vaga") e acompanha as candidaturas. Os passos são o 14 ao 19.

| # | Decisão | Por quê |
|---|---|---|
| P2–P3 | **O link era a conta**, sem login (substituída pela Q15) | A Sessão já era o contêiner |
| P4, P17 | **A casa é a primeira tela.** Ordem: saudação e Cobertura; "Achei uma vaga" e "Continuar a conversa"; Candidaturas; o currículo geral; "Apagar meus dados". O fim do v0 fica na página do currículo geral | A pessoa volta para fazer uma coisa nova, não para rever o fluxo |
| P5 | **"Achei uma vaga" espera o interrogatório geral** (Cobertura acima de 70% ou um currículo geral pronto) | O currículo por vaga escolhe do Corpus; com o Corpus vazio, ele só repete a vaga |
| P6 | **Retomar** cobre a fila aberta (rascunhos, depois pulados e adiados) e "Contar algo novo" | É o que alimenta o Corpus depois do primeiro currículo |
| P7 | **O currículo geral é uma foto:** "Gerar de novo" sob demanda, aviso "Seu Corpus mudou", versões antigas no histórico | Gerar sozinho gasta sem pedido; a foto deixa a pessoa decidir |
| P8, P24 | **A vaga entra como texto colado** (o link é guardado, nunca buscado). **Uma chamada** lê a vaga: empresa, cargo, língua, requisitos com o que já os cobre, lacunas e até 5 rascunhos relevantes. O código confere todo id | Buscar link é scraping e quebra; uma chamada é metade do custo e da espera |
| P9–P11 | **Checklist das lacunas** ("já usei" / "não usei"). Só "já usei" vira pergunta; os rascunhos trazidos também. O que sai vai para o **Corpus geral**. "Gerar agora" sempre disponível, com o número em aberto | Perguntar só o que falta. E o que a pessoa conta para uma vaga vale para as próximas |
| P25 | **A conversa da vaga é o mesmo motor** (turno, Jev, âncoras), com a fila restrita à vaga | O valor está no interrogatório; um formulário devolve a linha fraca |
| P12, P22 | **Cada versão traz o PDF e o Mapa da vaga** (requisito → a linha que o responde, ou "não coberto"). O crítico monta o mapa e as perguntas de entrevista (guardadas, não mostradas). **"Não coberto" nunca volta para reescrita** | Empurrar o redator para cobrir um requisito é o incentivo para inventar |
| P18 | **Título** = o cargo da vaga sem senioridade, só se o Corpus sustentar; senão, o cargo real. **Summary** mira os pedidos da vaga; o ausente fica ausente | Regras de redação |
| P16 | **O currículo é sempre em inglês**; vaga em português ganha um aviso | |
| P13–P14 | **Candidatura:** Preparando → Enviei (data) → Em entrevista → Proposta → Encerrada (com motivo). Um toque cada. "Enviei" trava a versão enviada | A lista é das vagas, não dos currículos; a versão enviada é a que a entrevista vai citar |
| P15, P21 | **Limites:** vagas por período e 3 gerações por vaga, com o custo por vaga no painel; cada vaga soma um orçamento ao teto de gasto da sessão. "Apagar esta vaga" esvazia a vaga (a linha fica, sem conteúdo) e **não devolve cota** | Apagar não pode zerar o teto |
| P19 | **Um aceite à parte para as vagas**, pedido no primeiro "Achei uma vaga". Quem recusa segue sem vagas e pode aceitar depois | O texto da vaga e o que sai dele é dado novo |
| P20 | **Painel:** a seção "Vagas" por sessão e as etapas das vagas (criadas → com currículo → enviadas → em entrevista → proposta) com o custo por vaga | "Enviei → Em entrevista" é a primeira métrica de resultado do produto |
| P23 | **Rotas de verdade** (`/conversa`, `/curriculo`, `/vagas/nova`, `/vagas/<id>`). Vaga de outra sessão dá 404 | Voltar e recarregar funcionam |
| P26 | **Desenvolvido pela assinatura** (`LLM_BACKEND=assinatura`, só local); rodada contra a API só com o custo à vista | |

## Parte 3: o hospedado e o código aberto

Quem quiser paga e usa o hospedado; quem quiser roda na própria máquina, gastando a própria chave. Os passos são o 20 ao 25.

| # | Decisão | Por quê |
|---|---|---|
| Q1 | **Open-core:** código aberto, self-host grátis com a chave do próprio dev; o hospedado é pago | Os termos da Anthropic não deixam uma assinatura pessoal servir um app para outras pessoas. O público não roda Docker; o hospedado continua sendo o produto |
| Q2 | **Tudo aberto**, prompts e regras inclusos | Prompt fechado dá um self-host ruim e vaza pela saída de qualquer jeito. O que se defende é conveniência e calibração contínua |
| Q3, Q7 | **Repo público com um commit inicial**; o histórico anterior não vem. Os passos vêm como roadmap aberto | Os passos são o que um contribuidor com Claude Code sabe seguir |
| Q4–Q5 | **AGPL-3.0, com CLA** ([`CONTRIBUTING.md`](../CONTRIBUTING.md)) | Open-source de verdade; quem hospedar uma cópia modificada abre o código. O CLA guarda o direito de relicenciar |
| Q6 | **Um código só, `MODO=local\|hospedado`.** No `local`: um usuário, sem login, sem consentimento, sem pagamento, sem landing, sem painel | Fork privado diverge; o código da cobrança não esconde nada |
| Q8, Q21 | **Self-host:** Docker oficial com `ANTHROPIC_API_KEY`, e nativo para contribuidor (aceita `LLM_BACKEND=assinatura`). O guarda da assinatura olha o `MODO`, não o `NODE_ENV`. **O Jev é opcional:** sem `TYPESAFE_API_KEY`, o avaliador roda pelas regras fixas | Tectonic e poppler no Windows são atrito; o README explica por que o Docker não usa a assinatura |
| Q9 | **No hospedado, o app paga a API.** Sem BYOK | Guardar chave de terceiro é alvo; quem tem chave prefere o self-host |
| Q10, Q23 | **O hospedado e o código aberto saem no mesmo dia,** o quanto antes. Ordem: contas → assinatura → privacidade → self-host e código aberto → lançamento. Candidaturas (18) e o painel das vagas (19) vêm depois | "Pague ou rode local" é a história do anúncio. Currículo geral e por vaga já entregam a promessa |
| Q11, Q14 | **Login com GitHub e Google** (sem magic link) e **assinatura recorrente** com renovação e cancelamento | O público é dev; sem e-mail transacional |
| Q12–Q13 | **Stripe Billing** (Checkout e Customer Portal hospedados), cartão, em BRL | O portal elimina as telas de cobrança |
| Q15 | **A conta substitui o token.** O link `/s/<token>` antigo, no primeiro acesso, pede o login e vincula; depois morre. As rotas vão para trás do login | |
| Q16 | **Paywall antes de começar:** nada sem assinatura. A página de venda mostra um "antes × depois" de uma pessoa inventada (os fixtures) | |
| Q17 | **Um Price só**, preço de beta travado enquanto a assinatura estiver ativa | Um preço, sem lógica de "vagas restantes" |
| Q18 | **Vagas por trimestre**, zerando na renovação; 3 versões por vaga | O custo medido de uma vaga define o limite |
| Q19 | **O painel mostra só métricas** (etapas, custo, turnos, "não sei"). A transcrição só abre com um **opt-in separado**, "pode ler para melhorar o produto" | O currículo de quem paga para mudar de emprego é o dado mais sensível do app |
| Q20 | **Reembolso: os 7 dias do CDC** (art. 49), integral, feito à mão no Stripe. Cancelar no portal mantém o acesso até o fim do período pago. **Apagar a conta cancela a assinatura na hora**, com aviso no botão | É a lei e é o padrão |
| Q22 | **Domínio:** `semsotaque.teamdbsolutions.com` | Checkout, fatura e a tela do OAuth mostram o domínio; trocar depois quebra callback e webhook |
| Q24 | **O fim para quem paga:** ficam a indicação (sem recompensa) e o depoimento (consentimento separado). As colunas do v0 ficam no banco | |
| Q25 | **Termos de uso e política de privacidade redigidos a partir do app real** (Anthropic e TypeSafe como operadores, Stripe, os 7 dias, o opt-in), com revisão de advogado depois do lançamento | Gerador não sabe por onde o dado passa |

## Em aberto

- Edição do Corpus pela pessoa.
- Pix recorrente; magic link.
- O Claude no lugar do Jev no `MODO=local`, se o interrogatório piorar muito sem ele.
- **Página cheia com pouca história.** A regra é "uma página cheia, sempre", mas um júnior pode não ter material para isso sem inventar. O interrogatório tenta extrair mais e, se faltar, o currículo sai com menos preenchimento e isso é registrado. Decidir com os dados.
