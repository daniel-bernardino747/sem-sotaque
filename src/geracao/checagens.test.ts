// Copyright (C) 2026 DB Software Solutions LTDA
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';

import { SELECTION_VERSION, type Selection } from '@/render';

import {
  checarAtribuicaoDeEstimativa,
  checarConfidencial,
  checarContagemDePartes,
  checarDisponibilidade,
  checarFontes,
  checarHedgesEAdjetivos,
  checarLabels,
  checarManagerESenioridade,
  checarNumeros,
  checarPeriodos,
  checarPoucosBullets,
  checarQualitativo,
  checarSecoes,
  checarTituloDaVaga,
  checarTudo,
  checarUmBulletPorFonte,
  conferirMapa,
  numerosDoTexto,
  type ContextoChecagem,
} from './checagens';

const metric = (valores: number[], origem: 'afirmado' | 'estimado' | 'qualitativo' = 'afirmado') => ({ valores, origem });

/** An invented Corpus: one employer, a confidential client, a course. */
const ctx: ContextoChecagem = {
  accomplishments: new Map([
    ['conciliacao', { tipo: 'engineering', affiliationId: 'acme', metrics: [metric([4, 25])] }],
    ['idempotencia', { tipo: 'engineering', affiliationId: 'acme', metrics: [metric([30, 0])] }],
    ['alerta', { tipo: 'engineering', affiliationId: 'acme', metrics: [metric([50_000], 'estimado')] }],
    ['suporte', { tipo: 'engineering', affiliationId: 'acme', metrics: [metric([], 'qualitativo')] }],
    ['rascunho', { tipo: 'engineering', affiliationId: 'acme', metrics: [] }],
    ['agenda', { tipo: 'project', affiliationId: null, metrics: [] }],
    ['boletos', { tipo: 'engineering', affiliationId: 'acme', metrics: [metric([1.2])] }],
  ]),
  affiliations: new Map([
    ['acme', { organizacao: 'Acme Pagamentos', cargo: 'Desenvolvedor Back-end Pleno', confidencial: false }],
    ['banco', { organizacao: 'Banco Ipê do Sul', cargo: 'Engenheiro de Dados', confidencial: true }],
  ]),
};

function selection(over: Partial<Selection> = {}, entries?: Selection['sections'][number]['groups'][number]['entries']): Selection {
  return {
    version: SELECTION_VERSION,
    language: 'en',
    targetRole: 'Software Engineer',
    header: { name: 'Ada Teste', role: 'Backend Engineer', location: 'Recife, Brazil', email: 'ada@example.com', links: [] },
    sections: [
      {
        title: 'Experience',
        groups: [
          {
            heading: { organisation: 'Acme Pagamentos', role: 'Backend Engineer', period: 'Mar 2022 - Present' },
            entries: entries ?? [
              { source: 'conciliacao', text: 'Cut nightly reconciliation from 4 hours to 25 minutes by rewriting it in Go.' },
              { source: 'idempotencia', text: 'Ended duplicate charges (~30 support tickets a month to 0) with idempotency keys.' },
              { source: 'suporte', text: 'Stopped support tickets about lost invoices with a status page.' },
              { source: 'conciliacao', label: 'Tech stack', text: 'Go, Kafka, PostgreSQL 16.' },
            ],
          },
        ],
      },
      {
        title: 'Education',
        groups: [{ heading: { organisation: 'Federal University', role: 'B.Sc. Computer Science', period: 'Mar 2014 - Dec 2018' }, entries: [] }],
      },
    ],
    ...over,
  };
}

const regras = (s: Selection, f: (s: Selection, c: ContextoChecagem) => { regra: string }[]) => f(s, ctx).map((v) => v.regra);

describe('numerosDoTexto', () => {
  it('reads digits, ~, units, multipliers and English words', () => {
    expect(numerosDoTexto('from ~4 hours to 25min')).toEqual(expect.arrayContaining([4, 25]));
    expect(numerosDoTexto('1.2M invoices')).toEqual(expect.arrayContaining([1.2, 1_200_000]));
    expect(numerosDoTexto('R$50k in fraud')).toEqual(expect.arrayContaining([50, 50_000]));
    expect(numerosDoTexto('1,200 drivers')).toEqual(expect.arrayContaining([1200]));
    expect(numerosDoTexto('mentored two juniors and twenty-five interns')).toEqual(expect.arrayContaining([2, 25]));
    expect(numerosDoTexto('cut latency by 90%')).toEqual([90]);
  });

  it('ignores digits inside names (S3, p95, EC2, OAuth2) and the article "one"', () => {
    expect(numerosDoTexto('Moved the p95 dashboards to S3 and EC2 with OAuth2; one of the services')).toEqual([]);
  });
});

describe('checarNumeros', () => {
  it('accepts the numbers of the source Metrics, with ~ and units', () => {
    expect(regras(selection(), checarNumeros)).toEqual([]);
  });

  it('refuses a number that is not in the source', () => {
    const s = selection({}, [{ source: 'conciliacao', text: 'Cut reconciliation time by 90% by rewriting it in Go.' }]);
    const v = checarNumeros(s, ctx);
    expect(v.map((x) => x.regra)).toEqual(['numero_sem_origem']);
    expect(v[0].mensagem).toContain('90');
    expect(v[0].onde).toEqual({ tipo: 'entrada', secao: 0, grupo: 0, entrada: 0 });
  });

  it("refuses a number from another record's Metric", () => {
    const s = selection({}, [{ source: 'conciliacao', text: 'Cut reconciliation from 4 hours to 25 minutes for 1.2M invoices.' }]);
    expect(regras(s, checarNumeros)).toEqual(['numero_sem_origem']);
  });

  it('leaves the stack line alone and checks the summary against the whole Corpus', () => {
    expect(regras(selection({ summary: 'Backend engineer who cut a 4-hour job to 25 minutes.' }), checarNumeros)).toEqual([]);
    expect(regras(selection({ summary: 'Backend engineer with 8 years of experience.' }), checarNumeros)).toEqual(['numero_sem_origem']);
  });
});

describe('checarQualitativo', () => {
  it('accepts a qualitative bullet after every numbered one', () => {
    expect(regras(selection(), checarQualitativo)).toEqual([]);
  });

  it('refuses a qualitative bullet ahead of a numbered one', () => {
    const s = selection({}, [
      { source: 'suporte', text: 'Stopped support tickets about lost invoices with a status page.' },
      { source: 'conciliacao', text: 'Cut nightly reconciliation from 4 hours to 25 minutes.' },
    ]);
    expect(regras(s, checarQualitativo)).toEqual(['qualitativo_fora_do_lugar']);
  });

  it('accepts a qualitative bullet anywhere in Projects', () => {
    const s = selection();
    s.sections.splice(1, 0, {
      title: 'Projects',
      groups: [{ entries: [{ source: 'suporte', text: 'A status page.' }, { source: 'conciliacao', text: 'From 4 hours to 25 minutes.' }] }],
    });
    expect(regras(s, checarQualitativo)).toEqual([]);
  });
});

describe('checarAtribuicaoDeEstimativa', () => {
  it('refuses who estimated', () => {
    for (const texto of ['Blocked ~R$50k of fraud (risk team estimate).', 'Blocked ~R$50k of fraud, by my estimate.', 'Blocked ~R$50k (estimativa do cliente).', "Blocked ~R$50k, according to the client's estimate."]) {
      expect(regras(selection({}, [{ source: 'alerta', text: texto }]), checarAtribuicaoDeEstimativa)).toEqual(['atribuicao_de_estimativa']);
    }
  });

  it('accepts the ~ alone', () => {
    expect(regras(selection({}, [{ source: 'alerta', text: 'Blocked ~R$50k of Pix fraud in its first month.' }]), checarAtribuicaoDeEstimativa)).toEqual([]);
  });
});

describe('checarHedgesEAdjetivos', () => {
  it('refuses a hedge in the verb and an empty adjective', () => {
    expect(regras(selection({}, [{ source: 'conciliacao', text: 'Helped to rewrite the reconciliation job.' }]), checarHedgesEAdjetivos)).toEqual(['hedge']);
    expect(regras(selection({}, [{ source: 'conciliacao', text: 'Led, while coding, the rewrite.' }]), checarHedgesEAdjetivos)).toEqual(['hedge']);
    expect(regras(selection({}, [{ source: 'conciliacao', text: 'Rewrote a mission-critical job.' }]), checarHedgesEAdjetivos)).toEqual(['adjetivo_vazio']);
    expect(regras(selection({ summary: 'Robust engineer.' }), checarHedgesEAdjetivos)).toEqual(['adjetivo_vazio']);
  });

  it('accepts a verb that owns the work', () => {
    expect(regras(selection(), checarHedgesEAdjetivos)).toEqual([]);
  });
});

describe('checarUmBulletPorFonte e checarLabels', () => {
  it('refuses two bullets from one source, not counting the stack line', () => {
    expect(regras(selection(), checarUmBulletPorFonte)).toEqual([]);
    const s = selection({}, [
      { source: 'conciliacao', text: 'Cut reconciliation from 4 hours to 25 minutes.' },
      { source: 'conciliacao', text: 'Rewrote reconciliation in Go.' },
    ]);
    expect(regras(s, checarUmBulletPorFonte)).toEqual(['fonte_repetida']);
  });

  it('refuses a label other than the stack line', () => {
    expect(regras(selection(), checarLabels)).toEqual([]);
    const s = selection({}, [{ source: 'conciliacao', label: 'Recon', text: 'From 4 hours to 25 minutes.' }]);
    expect(regras(s, checarLabels)).toEqual(['label_fora_da_stack']);
  });
});

describe('checarContagemDePartes', () => {
  it('refuses a count of parts as the result', () => {
    for (const texto of ['Built 9 of 10 modules of the panel.', 'Delivered 30 screens.', 'Shipped ~12 endpoints.']) {
      expect(regras(selection({}, [{ source: 'conciliacao', text: texto }]), checarContagemDePartes)).toEqual(['contagem_de_partes']);
    }
  });

  it('accepts a number that is a result', () => {
    expect(regras(selection(), checarContagemDePartes)).toEqual([]);
  });
});

describe('checarManagerESenioridade', () => {
  it('refuses Manager and seniority in a role, the header and the summary', () => {
    const comCargo = (role: string) => {
      const s = selection();
      s.sections[0].groups[0].heading!.role = role;
      return s;
    };
    expect(regras(comCargo('Software Manager'), checarManagerESenioridade)).toEqual(['manager']);
    expect(regras(comCargo('Senior Backend Engineer'), checarManagerESenioridade)).toEqual(['senioridade']);
    expect(regras(comCargo('Desenvolvedor Pleno'), checarManagerESenioridade)).toEqual(['senioridade']);
    expect(regras(selection({ header: { ...selection().header, role: 'Mid-Level Engineer' } }), checarManagerESenioridade)).toEqual(['senioridade']);
    expect(regras(selection({ summary: 'Engineer who moved into management.' }), checarManagerESenioridade)).toEqual(['manager']);
  });

  it('accepts an engineering title', () => {
    expect(regras(selection(), checarManagerESenioridade)).toEqual([]);
  });
});

describe('checarDisponibilidade', () => {
  it('refuses availability in the header and the summary', () => {
    expect(regras(selection({ summary: 'Open to remote contract work.' }), checarDisponibilidade)).toEqual(['disponibilidade']);
    expect(regras(selection({ header: { ...selection().header, role: 'Backend Engineer (PJ)' } }), checarDisponibilidade)).toEqual(['disponibilidade']);
    expect(regras(selection({ summary: 'Available 9am-6pm UTC-3.' }), checarDisponibilidade)).toEqual(['disponibilidade']);
  });

  it('accepts a summary about the work', () => {
    expect(regras(selection({ summary: 'Backend engineer for payment systems.' }), checarDisponibilidade)).toEqual([]);
  });
});

describe('checarPeriodos', () => {
  it('accepts month/year and Present', () => {
    expect(regras(selection(), checarPeriodos)).toEqual([]);
  });

  it('accepts the years of the safety net (no confirmed month) and a degree year', () => {
    for (const period of ['2022 - 2024', '2022 - Present', '2022', 'Expected 2027']) {
      const s = selection();
      s.sections[0].groups[0].heading!.period = period;
      expect(regras(s, checarPeriodos)).toEqual([]);
    }
  });

  it('refuses anything else', () => {
    for (const period of ['2022 – 2024', 'Mar 2022 - 2024', 'since 2022', '22 - 24']) {
      const s = selection();
      s.sections[0].groups[0].heading!.period = period;
      expect(regras(s, checarPeriodos)).toEqual(['periodo']);
    }
  });
});

describe('checarSecoes', () => {
  it('accepts Experience, Projects and Education in this order', () => {
    expect(regras(selection(), checarSecoes)).toEqual([]);
  });

  it('refuses another name, Education before the end, and Experience after Projects', () => {
    const skills = selection();
    skills.sections.splice(1, 0, { title: 'Technical Skills', groups: [{ entries: [{ source: 'conciliacao', text: 'Go' }] }] });
    expect(regras(skills, checarSecoes)).toEqual(['secoes']);

    const invertida = selection();
    invertida.sections.reverse();
    expect(regras(invertida, checarSecoes)).toEqual(['secoes']);
  });
});

describe('checarPoucosBullets', () => {
  it('refuses fewer than three bullets when the Affiliation has more to give', () => {
    const s = selection({}, [
      { source: 'conciliacao', text: 'Cut reconciliation from 4 hours to 25 minutes.' },
      { source: 'idempotencia', text: 'Ended duplicate charges, ~30 a month to 0.' },
    ]);
    const r = checarPoucosBullets(s, ctx);
    expect(r.violacoes.map((v) => v.regra)).toEqual(['poucos_bullets']);
    expect(r.notas).toEqual([]);
  });

  it('only notes it when the Affiliation has nothing else with a Metric', () => {
    const pouco: ContextoChecagem = {
      ...ctx,
      accomplishments: new Map([...ctx.accomplishments].filter(([id]) => ['conciliacao', 'idempotencia', 'rascunho'].includes(id))),
    };
    const s = selection({}, [
      { source: 'conciliacao', text: 'Cut reconciliation from 4 hours to 25 minutes.' },
      { source: 'idempotencia', text: 'Ended duplicate charges, ~30 a month to 0.' },
    ]);
    const r = checarPoucosBullets(s, pouco);
    expect(r.violacoes).toEqual([]);
    expect(r.notas).toHaveLength(1);
  });
});

describe('checarConfidencial', () => {
  it('refuses the name of a confidential Affiliation anywhere, or a distinctive word of it', () => {
    const s = selection();
    s.sections[0].groups.push({
      heading: { organisation: "Banco Ipê do Sul", role: 'Backend Engineer', period: 'Jan 2020 - Feb 2022' },
      entries: [],
    });
    expect(regras(s, checarConfidencial)).toEqual(['confidencial_pelo_nome']);

    const palavra = selection({}, [{ source: 'conciliacao', text: 'Cut the Ipe reconciliation from 4 hours to 25 minutes.' }]);
    expect(regras(palavra, checarConfidencial)).toEqual(['confidencial_pelo_nome']);
  });

  it("accepts its public description and a name that is not confidential", () => {
    const s = selection();
    s.sections[0].groups.push({
      heading: { organisation: "One of southern Brazil's largest home-loan banks", role: 'Backend Engineer' },
      entries: [],
    });
    expect(regras(s, checarConfidencial)).toEqual([]);
  });
});

describe('checarFontes', () => {
  it('refuses an unknown source and a draft outside Projects', () => {
    expect(regras(selection({}, [{ source: 'inventado', text: 'x' }]), checarFontes)).toEqual(['fonte']);
    expect(regras(selection({}, [{ source: 'rascunho', text: 'x' }]), checarFontes)).toEqual(['fonte']);
  });

  it('accepts a project without a Metric in Projects', () => {
    const s = selection();
    s.sections.splice(1, 0, { title: 'Projects', groups: [{ entries: [{ source: 'agenda', text: 'A booking app a hair salon uses instead of a paper diary.' }] }] });
    expect(regras(s, checarFontes)).toEqual([]);
  });
});

describe('checarTudo', () => {
  it('passes a clean Selection', () => {
    expect(checarTudo(selection(), ctx).violacoes).toEqual([]);
  });
});

describe('checarTituloDaVaga', () => {
  const comVaga = (cargo: string): ContextoChecagem => ({ ...ctx, vaga: { cargo } });
  const titulo = (role: string | undefined, c: ContextoChecagem) => {
    const s = selection();
    s.header = { ...s.header, role };
    return checarTituloDaVaga(s, c).map((v) => v.regra);
  };

  it("takes the job's role, without its seniority, when an Affiliation held an equivalent one", () => {
    // "Desenvolvedor Back-end Pleno" holds up "Backend Engineer" and "Back-End Developer".
    expect(titulo('Backend Engineer', comVaga('Senior Backend Engineer'))).toEqual([]);
    expect(titulo('Back-End Developer', comVaga('Back-End Developer'))).toEqual([]);
    expect(titulo('Data Engineer', comVaga('Staff Data Engineer'))).toEqual([]);
  });

  it("refuses a role no Affiliation held, the job's included", () => {
    const c = comVaga('Senior Platform Engineer');
    expect(titulo('Platform Engineer', c)).toEqual(['cargo_sem_lastro']);
    expect(titulo('Frontend Engineer', c)).toEqual(['cargo_sem_lastro']);
    const [v] = checarTituloDaVaga({ ...selection(), header: { ...selection().header, role: 'Platform Engineer' } }, c);
    expect(v.onde).toEqual({ tipo: 'cabecalho' });
    expect(v.mensagem).toContain('Desenvolvedor Back-end Pleno');
  });

  it('accepts "Software Engineer" from any engineering role, and no headline at all', () => {
    expect(titulo('Software Engineer', comVaga('Senior Software Engineer'))).toEqual([]);
    expect(titulo(undefined, comVaga('Senior Platform Engineer'))).toEqual([]);
  });

  it('leaves the general résumé alone', () => {
    expect(titulo('Platform Engineer', ctx)).toEqual([]);
  });
});

describe('conferirMapa', () => {
  const s = selection();

  it('keeps a line of the Selection, and turns an id that is not on the page into "not covered"', () => {
    const mapa = conferirMapa(
      [
        { requisitoId: 'go', accomplishmentId: 'conciliacao', naStack: false },
        { requisitoId: 'kafka', accomplishmentId: 'conciliacao', naStack: true },
        // A record of the Corpus that is not on this page, and one that does not exist.
        { requisitoId: 'boletos', accomplishmentId: 'boletos', naStack: false },
        { requisitoId: 'rust', accomplishmentId: 'inventado', naStack: false },
      ],
      ['go', 'kafka', 'boletos', 'rust', 'esquecido'],
      s,
    );
    expect(mapa).toEqual([
      { requisitoId: 'go', accomplishmentId: 'conciliacao', naStack: false },
      { requisitoId: 'kafka', accomplishmentId: 'conciliacao', naStack: true },
      { requisitoId: 'boletos', accomplishmentId: null, naStack: false },
      { requisitoId: 'rust', accomplishmentId: null, naStack: false },
      // A requirement the answer skipped is not covered either.
      { requisitoId: 'esquecido', accomplishmentId: null, naStack: false },
    ]);
  });

  it("drops a requirement that is not the Vaga's and keeps the first answer for each", () => {
    const mapa = conferirMapa(
      [
        { requisitoId: 'outro', accomplishmentId: 'conciliacao', naStack: false },
        { requisitoId: 'go', accomplishmentId: 'idempotencia', naStack: false },
        { requisitoId: 'go', accomplishmentId: 'conciliacao', naStack: false },
      ],
      ['go'],
      s,
    );
    expect(mapa).toEqual([{ requisitoId: 'go', accomplishmentId: 'idempotencia', naStack: false }]);
  });
});
