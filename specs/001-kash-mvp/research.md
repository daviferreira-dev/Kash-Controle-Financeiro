# Phase 0 — Research: Kash MVP

**Feature**: `001-kash-mvp` | **Date**: 2026-08-29

Todas as incógnitas do Technical Context foram resolvidas. Nenhum `NEEDS CLARIFICATION` permanece.

---

## R-001 — Representação de valores monetários

**Decision**: Armazenar todo valor em **centavos, como `number` inteiro** (`amountCents: number`). Formatar apenas na borda de apresentação, via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

**Rationale**: `0.1 + 0.2 !== 0.3` em ponto flutuante IEEE-754; somar centenas de despesas em `float` acumula erro visível em totais e faz um orçamento "estourar" por R$ 0,01. Inteiros em centavos eliminam a classe inteira de bugs, e `Number.MAX_SAFE_INTEGER` cobre valores absurdamente acima do teto de R$ 99.999.999,99 do FR-003. Serializa em JSON sem perda, o que importa para o export/import do FR-030.

**Alternatives considered**:
- `float` em reais — descartado pelo erro de arredondamento acumulado.
- `Decimal.js` / `dinero.js` — corretos, mas adicionam dependência e peso de bundle para um problema que inteiros já resolvem neste escopo.
- `BigInt` — desnecessário na faixa de valores e atrapalha a serialização JSON.

**Consequences**: entrada e saída sempre passam por `parseBRL`/`formatBRL` em `src/lib/money.ts`. Percentuais de orçamento (FR-015) são calculados sobre centavos e arredondados só na exibição.

---

## R-002 — Representação e manipulação de datas

**Decision**: Armazenar datas como **string `YYYY-MM-DD`** (data civil, sem hora e sem fuso). Manipular com funções próprias em `src/lib/date.ts` sobre `Date` local, sem biblioteca.

**Rationale**: Um lançamento financeiro é uma data civil, não um instante. Guardar ISO com timestamp introduz o clássico bug de "a despesa do dia 01 aparece no dia 31 do mês anterior" quando o fuso é negativo (Brasil é UTC-3). String `YYYY-MM-DD` ordena lexicograficamente igual à ordem cronológica, o que torna filtro por mês (FR-005) um simples `startsWith('2026-08')` e ordenação decrescente (FR-005) uma comparação de strings — barato o suficiente para o alvo de 1.000 lançamentos do SC-005.

**Alternatives considered**:
- `Date` nativo serializado — descartado pelo deslocamento de fuso na (de)serialização.
- `date-fns` — boa biblioteca, mas as operações necessárias são poucas (somar meses com clamp de fim de mês, somar semanas/anos, primeiro/último dia do mês) e escrevê-las mantém o bundle enxuto.
- `Temporal` (`Temporal.PlainDate` seria o tipo ideal) — ainda depende de polyfill; reavaliar em versão futura.

**Consequences**: `addMonthsClamped` implementa explicitamente a regra do FR-025 (dia 31 em mês curto → último dia do mês). Datas são comparadas como string em todo lugar; nenhum `new Date(string)` sem sufixo de fuso.

---

## R-003 — Camada de persistência

**Decision**: **LocalStorage** por trás de uma interface `Repository<T>` síncrona-mas-`Promise`-based, com uma implementação `LocalStorageRepository`. Um único `KashDatabase` agrega os repositórios e mantém um `schemaVersion` para migrações.

**Rationale**: Custo zero, sem backend, funciona offline e atende FR-028. A interface assíncrona (`Promise<T>`) desde o início é a decisão-chave: permite trocar por Supabase/IndexedDB depois sem tocar em nenhum componente, mesmo que hoje a implementação resolva imediatamente. Um `schemaVersion` gravado junto aos dados evita que uma futura mudança de formato quebre a base de quem já usa.

**Alternatives considered**:
- Acesso direto a `localStorage` nos componentes — descartado: espalha serialização e trava o app no browser.
- IndexedDB (via `idb`) — mais capacidade e assíncrono de verdade, mas complexidade desnecessária para o volume do SC-005 (1.000 lançamentos ≈ centenas de KB, folgado dentro dos ~5MB de LocalStorage).
- Supabase — free tier resolveria sync e login, mas exige conta, rede e autenticação; contraria as Assumptions do MVP. É o caminho de evolução previsto.

**Consequences**: toda escrita é envolvida em `try/catch` para capturar `QuotaExceededError` e modo privativo, alimentando o aviso do FR-029. O export/import do FR-030 é um dump direto do agregado versionado.

---

## R-004 — Gerenciamento de estado na UI

**Decision**: **React Context + `useReducer`** por domínio, hidratado do repositório na inicialização, com um `KashProvider` no topo. Sem biblioteca de estado externa.

**Rationale**: O dataset inteiro cabe em memória (SC-005: 1.000 lançamentos), então o estado é uma cópia local sincronizada com o repositório — não há cache de servidor a gerenciar, que é o problema que React Query/SWR resolvem. Derivados (saldo, totais por categoria, consumo de orçamento) são calculados com `useMemo` sobre o array em memória, o que mantém tudo abaixo do 1s do SC-005 sem estrutura adicional.

**Alternatives considered**:
- Zustand — API mais enxuta que Context, mas é uma dependência a mais para um ganho marginal neste tamanho.
- Redux Toolkit — desproporcional ao escopo.
- React Query — projetado para estado de servidor; sem servidor, só adiciona indireção.

**Consequences**: se o volume crescer muito além do previsto, a migração natural é Zustand + seletores, sem mudar a camada de repositório.

---

## R-005 — Geração idempotente de recorrências

**Decision**: Cada recorrência guarda `lastGeneratedDate: string | null`. Na inicialização do app, o `RecurrenceEngine` percorre as recorrências ativas e gera as ocorrências de `lastGeneratedDate` (exclusivo) até **hoje** (inclusive), gravando em cada transação gerada `sourceRecurrenceId` e `occurrenceDate`. A idempotência é garantida por uma **chave determinística** `${recurrenceId}:${occurrenceDate}`, verificada contra as transações existentes antes de inserir.

**Rationale**: Atende FR-020, FR-021 e FR-022 de uma vez. O `lastGeneratedDate` sozinho já evitaria duplicatas no caminho feliz, mas a chave determinística protege contra o caso real de duas abas abertas simultaneamente gravando no mesmo LocalStorage — a segunda aba encontra a ocorrência já existente e não duplica. A geração é feita em um único lote com o número de itens criados retornado, alimentando o aviso de "N lançamentos criados" do edge case de recorrência antiga.

**Alternatives considered**:
- Só `lastGeneratedDate`, sem chave — descartado pela corrida entre abas.
- Materializar ocorrências futuras — viola FR-022 e polui o Overview de meses futuros.
- Calcular ocorrências virtualmente na leitura, sem persistir — impediria o usuário de editar ou excluir um lançamento gerado individualmente (FR-023 exige que a edição de um não afete os demais).

**Consequences**: excluir um lançamento gerado **não** faz a recorrência recriá-lo, porque `lastGeneratedDate` já avançou — comportamento correto e alinhado ao cenário 5 da User Story 4.

---

## R-006 — Gráfico do Overview

**Decision**: **SVG próprio**, sem biblioteca de gráficos. O FR-010 pede a distribuição das despesas do mês por categoria — atendida por um gráfico de rosca (donut) acompanhado de uma legenda-lista com valor e percentual por categoria.

**Rationale**: É um único gráfico, com uma única forma, sobre no máximo ~10 categorias. Recharts adiciona ~100KB gzipped e traz consigo um sistema de temas que brigaria com o design system editorial. Um donut em SVG são poucas dezenas de linhas de `stroke-dasharray`, herda os tokens de cor diretamente e é naturalmente responsivo. A legenda-lista textual também satisfaz a exigência de não depender só de cor (FR-007, SC-007).

**Alternatives considered**:
- Recharts / Chart.js — peso e estilização desproporcionais a um gráfico.
- Barras horizontais CSS puras — ainda mais simples, e são o que a tela de Orçamentos usa; para o Overview o donut comunica melhor a noção de "parte do todo".

**Consequences**: se o backlog pós-MVP trouxer séries temporais (evolução mês a mês), reavaliar a adoção de uma biblioteca.

---

## R-007 — Design system em código

**Decision**: Tokens do "Premium Editorial Finance" expressos como **CSS custom properties** em `src/styles/tokens.css`, referenciadas pelo `tailwind.config.ts` via `theme.extend`. Fontes Playfair Display, Inter e Archivo Narrow carregadas pelo Google Fonts com `display=swap` e fallbacks reais.

**Rationale**: Custom properties permitem o tema escuro futuro trocando apenas o bloco de variáveis, sem duplicar classes Tailwind. Mapear os tokens no `theme.extend` faz o Tailwind gerar utilitários semânticos (`bg-surface`, `text-on-surface-variant`, `border-outline-variant`) em vez de hex soltos pelos componentes.

**Alternatives considered**:
- Hex direto no `tailwind.config` — funciona, mas fecha a porta do tema escuro por variável.
- CSS-in-JS — dependência e custo de runtime desnecessários.

**Consequences**: os valores de cor, tipografia, raio (4px) e espaçamento (base 4px) vêm literalmente do `designMd` do projeto Stitch `17495499553694175600`, mantendo mockup e código na mesma fonte de verdade.

---

## R-008 — Estratégia de testes

**Decision**: **Vitest** para unidade e **React Testing Library** para componentes. Cobertura obrigatória na lógica de domínio pura — `money`, `date`, `RecurrenceEngine`, cálculos de orçamento e agregações do Overview. Componentes: testar comportamento observável dos fluxos das user stories, não implementação.

**Rationale**: Vitest compartilha a config do Vite (zero setup extra) e roda em milissegundos. O risco real do Kash está na aritmética e nas datas — é ali que um erro silencioso corrompe o dinheiro do usuário —, então é ali que a cobertura precisa ser densa. RTL cobre os cenários de aceitação da spec sem acoplar aos detalhes de renderização.

**Alternatives considered**:
- Jest — mais lento e exigiria configuração paralela à do Vite.
- Playwright / E2E — valioso, mas fora do MVP; o `quickstart.md` cobre a validação manual ponta a ponta.

**Consequences**: `RecurrenceEngine` é escrito como função pura que recebe "hoje" como parâmetro, tornando testável o cenário "abrir o app em 29/08/2026" sem mockar o relógio global.

---

## R-009 — Roteamento

**Decision**: **React Router** (`react-router-dom`) com rotas `/`, `/transacoes`, `/orcamentos`, `/recorrencias`, `/configuracoes`.

**Rationale**: O app tem 5 áreas navegáveis e o usuário espera que o botão voltar do navegador e URLs compartilháveis funcionem. Rotas em português mantêm a coerência com o FR-031.

**Alternatives considered**:
- Estado local de aba, sem rotas — quebra o botão voltar e impede link direto.
- TanStack Router — tipagem superior, mas curva e peso sem retorno neste escopo.

---

## R-010 — Layout responsivo

**Decision**: **Mobile-first**, com navegação inferior fixa (bottom tab bar) até `md` e sidebar lateral a partir de `md`. Breakpoint base de referência: 390px (SC-008).

**Rationale**: Os mockups do Stitch foram desenhados em 390px de largura, e o SC-008 exige operação completa nessa largura sem rolagem horizontal. Construir mobile-first e expandir é mais barato do que o inverso, e o FR-032 exige paridade de funções nos dois formatos.
