import type {
  Account,
  Budget,
  Category,
  IsoDate,
  IsoMonth,
  KashSnapshot,
  Recurrence,
  Transaction,
  TransactionType,
} from '@/domain/types';
import { SCHEMA_VERSION } from '@/domain/types';
import { addMonths, daysInMonth, monthOf } from '@/lib/date';

/**
 * Dataset fictício da versão demo (ver README → "Demo e deploy").
 *
 * É gerado em relação a `hoje`, não fixo em disco: assim o link publicado
 * continua mostrando "mês atual" com movimento por mais que o tempo passe. O
 * gerador é determinístico (PRNG semeado por constante), então todo visitante
 * vê exatamente os mesmos números. Nada aqui é dado real.
 */

const CATEGORIES: Category[] = [
  { id: 'demo-cat-alimentacao', name: 'Alimentação', icon: 'utensils', color: '#a03f2d', kind: 'expense', archived: false, isDefault: true },
  { id: 'demo-cat-transporte', name: 'Transporte', icon: 'car', color: '#705c1e', kind: 'expense', archived: false, isDefault: true },
  { id: 'demo-cat-moradia', name: 'Moradia', icon: 'home', color: '#56423e', kind: 'expense', archived: false, isDefault: true },
  { id: 'demo-cat-contas', name: 'Contas de casa', icon: 'plug', color: '#4f6d73', kind: 'expense', archived: false, isDefault: true },
  { id: 'demo-cat-lazer', name: 'Lazer', icon: 'sparkles', color: '#c3a963', kind: 'expense', archived: false, isDefault: true },
  { id: 'demo-cat-saude', name: 'Saúde', icon: 'heart', color: '#8a726d', kind: 'expense', archived: false, isDefault: true },
  { id: 'demo-cat-educacao', name: 'Educação', icon: 'book', color: '#2f6b4f', kind: 'expense', archived: false, isDefault: true },
  { id: 'demo-cat-assinaturas', name: 'Assinaturas', icon: 'repeat', color: '#e8755f', kind: 'expense', archived: false, isDefault: true },
  { id: 'demo-cat-outros', name: 'Outros', icon: 'tag', color: '#5f5e5e', kind: 'both', archived: false, isDefault: true },
];

const ACCOUNTS: Account[] = [
  { id: 'demo-acc-nubank', name: 'Nubank', initialBalanceCents: 284000, archived: false, isDefault: true },
  { id: 'demo-acc-itau', name: 'Itaú', initialBalanceCents: 1637000, archived: false, isDefault: true },
  { id: 'demo-acc-carteira', name: 'Carteira', initialBalanceCents: 9000, archived: false, isDefault: true },
];

const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.name, c.id])) as Record<string, string>;

/** PRNG determinístico (mulberry32) — mesma semente, mesmo dataset sempre. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pattern {
  category: string;
  account: string;
  descriptions: string[];
  /** Ocorrências por mês (sorteado no intervalo, inclusivo). */
  perMonth: [number, number];
  /** Valor em centavos (sorteado no intervalo, inclusivo). */
  cents: [number, number];
}

const EXPENSE_PATTERNS: Pattern[] = [
  { category: 'Alimentação', account: 'Nubank', perMonth: [4, 6], cents: [5200, 24800], descriptions: ['Supermercado Pão de Açúcar', 'Hortifruti da esquina', 'Mercado Dia', 'Atacadão', 'Padaria'] },
  { category: 'Alimentação', account: 'Nubank', perMonth: [3, 5], cents: [2800, 9400], descriptions: ['iFood', 'Restaurante self-service', 'Lanchonete', 'Cafeteria', 'Pizzaria do bairro'] },
  { category: 'Transporte', account: 'Nubank', perMonth: [5, 9], cents: [980, 4600], descriptions: ['Uber', '99 POP', 'Posto Shell', 'Bilhete Único', 'Estacionamento'] },
  { category: 'Lazer', account: 'Nubank', perMonth: [1, 3], cents: [3800, 17600], descriptions: ['Cinema', 'Bar com amigos', 'Show', 'Boliche', 'Ingresso de museu'] },
  { category: 'Saúde', account: 'Nubank', perMonth: [0, 2], cents: [4500, 29000], descriptions: ['Farmácia', 'Consulta médica', 'Academia', 'Exame laboratorial'] },
  { category: 'Educação', account: 'Nubank', perMonth: [0, 1], cents: [8900, 24900], descriptions: ['Curso online Udemy', 'Livro técnico', 'Mensalidade de inglês'] },
  { category: 'Assinaturas', account: 'Nubank', perMonth: [1, 2], cents: [1990, 3490], descriptions: ['Spotify', 'iCloud', 'Jornal digital'] },
  { category: 'Outros', account: 'Carteira', perMonth: [1, 2], cents: [1800, 12000], descriptions: ['Presente', 'Pet shop', 'Doação', 'Feira de rua'] },
];

interface RecSpec {
  type: TransactionType;
  description: string;
  category: string;
  account: string;
  cents: number;
  day: number;
  notes: string | null;
  status: 'active' | 'paused';
}

const MONTHLY_RECURRENCES: RecSpec[] = [
  { type: 'income', description: 'Salário', category: 'Outros', account: 'Itaú', cents: 648000, day: 5, notes: null, status: 'active' },
  { type: 'expense', description: 'Aluguel', category: 'Moradia', account: 'Itaú', cents: 213000, day: 8, notes: 'Vencimento todo dia 8', status: 'active' },
  { type: 'expense', description: 'Energia (EDP)', category: 'Contas de casa', account: 'Nubank', cents: 18740, day: 12, notes: null, status: 'active' },
  { type: 'expense', description: 'Internet fibra', category: 'Contas de casa', account: 'Nubank', cents: 9990, day: 18, notes: null, status: 'active' },
  { type: 'expense', description: 'Plano de streaming (família)', category: 'Assinaturas', account: 'Nubank', cents: 5590, day: 15, notes: null, status: 'active' },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function iso(month: IsoMonth, day: number): IsoDate {
  const [y, m] = month.split('-').map(Number);
  const d = Math.min(day, daysInMonth(y!, m!));
  return `${month}-${pad(d)}`;
}
function stamp(date: IsoDate): string {
  return `${date}T12:00:00.000Z`;
}

const MONTHS_OF_HISTORY = 6;

/** Monta o snapshot completo da demo, ancorado em `today`. */
export function buildDemoSnapshot(today: IsoDate): KashSnapshot {
  const rand = mulberry32(20260829);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const between = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));

  const currentMonth = monthOf(today);
  const months: IsoMonth[] = [];
  for (let i = MONTHS_OF_HISTORY - 1; i >= 0; i--) months.push(addMonths(currentMonth, -i));
  const firstMonth = months[0]!;

  const transactions: Transaction[] = [];
  let seq = 0;
  const add = (t: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): void => {
    if (t.date > today) return;
    seq += 1;
    transactions.push({
      ...t,
      id: `demo-tx-${seq}`,
      createdAt: stamp(t.date),
      updatedAt: stamp(t.date),
    });
  };

  // Recorrências mensais + suas ocorrências já materializadas.
  const recurrences: Recurrence[] = [];
  for (const spec of MONTHLY_RECURRENCES) {
    const id = `demo-rec-${spec.description.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`;
    const startDate = iso(firstMonth, spec.day);
    let lastGenerated: IsoDate | null = null;
    for (const month of months) {
      const date = iso(month, spec.day);
      if (date > today) break;
      add({
        type: spec.type,
        amountCents: spec.cents,
        description: spec.description,
        date,
        categoryId: CAT[spec.category]!,
        accountId: ACCOUNTS.find((a) => a.name === spec.account)!.id,
        notes: spec.notes,
        source: 'recurrence',
        sourceRecurrenceId: id,
        occurrenceDate: date,
      });
      lastGenerated = date;
    }
    recurrences.push({
      id,
      type: spec.type,
      amountCents: spec.cents,
      description: spec.description,
      categoryId: CAT[spec.category]!,
      accountId: ACCOUNTS.find((a) => a.name === spec.account)!.id,
      notes: spec.notes,
      frequency: 'monthly',
      startDate,
      endDate: null,
      status: spec.status,
      lastGeneratedDate: lastGenerated,
      createdAt: stamp(startDate),
      updatedAt: stamp(startDate),
    });
  }

  // Uma recorrência anual pausada, para ilustrar o estado.
  {
    const start = iso(addMonths(currentMonth, -2), 20);
    recurrences.push({
      id: 'demo-rec-anuidade-cartao',
      type: 'expense',
      amountCents: 42000,
      description: 'Anuidade do cartão',
      categoryId: CAT['Outros']!,
      accountId: 'demo-acc-itau',
      notes: 'Pausada: cobrança negociada com o banco',
      frequency: 'yearly',
      startDate: start,
      endDate: null,
      status: 'paused',
      lastGeneratedDate: null,
      createdAt: stamp(start),
      updatedAt: stamp(start),
    });
  }

  // Gastos avulsos por padrão de consumo.
  for (const month of months) {
    for (const p of EXPENSE_PATTERNS) {
      const n = between(p.perMonth[0], p.perMonth[1]);
      for (let i = 0; i < n; i++) {
        add({
          type: 'expense',
          amountCents: between(p.cents[0], p.cents[1]),
          description: pick(p.descriptions),
          date: iso(month, between(1, 28)),
          categoryId: CAT[p.category]!,
          accountId: ACCOUNTS.find((a) => a.name === p.account)!.id,
          notes: null,
          source: 'manual',
          sourceRecurrenceId: null,
          occurrenceDate: null,
        });
      }
    }
    // Renda extra esporádica.
    if (rand() < 0.5) {
      add({
        type: 'income',
        amountCents: between(70000, 165000),
        description: 'Projeto freelance',
        date: iso(month, between(10, 24)),
        categoryId: CAT['Outros']!,
        accountId: 'demo-acc-nubank',
        notes: null,
        source: 'manual',
        sourceRecurrenceId: null,
        occurrenceDate: null,
      });
    }
  }

  // Orçamentos ancorados no gasto do MÊS CORRENTE até hoje: o teto é definido
  // como uma fração desse gasto, de modo que as três faixas de status
  // (estourado, em atenção, dentro do limite) apareçam já na primeira tela,
  // independentemente do dia do mês em que a demo é aberta.
  const spentThisMonth = (categoryId: string): number =>
    transactions
      .filter(
        (t) =>
          t.type === 'expense' &&
          t.categoryId === categoryId &&
          t.date.startsWith(currentMonth),
      )
      .reduce((s, t) => s + t.amountCents, 0);

  const round100 = (n: number): number => Math.max(1000, Math.round(n / 1000) * 1000);
  // [categoria, % do gasto atual que o teto representa]
  const budgetSpecs: Array<[string, number]> = [
    ['Alimentação', 112], // gasto passou do teto → Estourado
    ['Lazer', 88], // gasto entre 80% e 100% → Em atenção
    ['Transporte', 55], // gasto abaixo de 80% → Dentro do limite
  ];
  const start = stamp(iso(firstMonth, 1));
  const budgets: Budget[] = budgetSpecs.map(([name, pct], i) => {
    const spent = spentThisMonth(CAT[name]!) || 30000;
    return {
      id: `demo-budget-${i + 1}`,
      categoryId: CAT[name]!,
      limitCents: round100((spent / pct) * 100),
      startMonth: firstMonth,
      createdAt: start,
      updatedAt: start,
    };
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    transactions,
    categories: CATEGORIES,
    accounts: ACCOUNTS,
    budgets,
    recurrences,
    exportedAt: stamp(today),
  };
}
