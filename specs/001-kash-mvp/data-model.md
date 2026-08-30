# Phase 1 — Data Model: Kash MVP

**Feature**: `001-kash-mvp` | **Date**: 2026-08-29

Convenções globais (ver [research.md](./research.md)):

- **Dinheiro**: sempre `amountCents: number` — inteiro, em centavos, sempre positivo. O sinal é derivado de `type`, nunca armazenado (FR-003).
- **Datas**: sempre `string` no formato `YYYY-MM-DD` (data civil, sem hora, sem fuso) — R-002.
- **Ids**: `string` UUID v4 gerado por `crypto.randomUUID()`.
- **Timestamps de auditoria**: `createdAt` / `updatedAt` como ISO 8601 completo com fuso — são instantes, não datas civis.

---

## Entidade: Transaction

Um movimento financeiro concreto. É a única entidade que afeta saldos.

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `id` | `string` | sim | UUID v4, imutável |
| `type` | `'income' \| 'expense'` | sim | Define o sinal na exibição (FR-007) |
| `amountCents` | `number` | sim | Inteiro, `> 0` e `<= 9_999_999_999` (R$ 99.999.999,99) — FR-003 |
| `description` | `string` | sim | Após `trim`, comprimento entre 1 e 120 |
| `date` | `string` | sim | `YYYY-MM-DD` válido; datas futuras são permitidas |
| `categoryId` | `string` | sim | Referencia `Category.id`; pode apontar para categoria arquivada |
| `accountId` | `string` | sim | Referencia `Account.id`; pode apontar para conta arquivada |
| `notes` | `string \| null` | não | Máximo 500 caracteres — FR-002 |
| `source` | `'manual' \| 'recurrence'` | sim | Default `'manual'` |
| `sourceRecurrenceId` | `string \| null` | não | Preenchido apenas quando `source === 'recurrence'` — FR-024 |
| `occurrenceDate` | `string \| null` | não | Data teórica da ocorrência; junto com `sourceRecurrenceId` forma a chave de idempotência — FR-021 |
| `createdAt` | `string` | sim | ISO 8601 |
| `updatedAt` | `string` | sim | ISO 8601 |

**Invariantes**

- `source === 'recurrence'` ⟺ `sourceRecurrenceId !== null` e `occurrenceDate !== null`.
- O par (`sourceRecurrenceId`, `occurrenceDate`) é **único** em toda a coleção — é o que impede a duplicação do FR-021.
- Editar uma transação gerada por recorrência **não** propaga para a recorrência nem para outras ocorrências (FR-023).
- Excluir uma transação gerada **não** faz a engine recriá-la, pois `lastGeneratedDate` da recorrência já avançou.

**Relacionamentos**: N:1 com `Category`, N:1 com `Account`, N:1 opcional com `Recurrence`.

---

## Entidade: Category

Rótulo de classificação. Nunca é apagada de fato quando possui histórico (FR-027).

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `id` | `string` | sim | UUID v4 |
| `name` | `string` | sim | 1 a 40 caracteres, único entre categorias **ativas** (case-insensitive) |
| `icon` | `string` | sim | Nome do ícone; default `'tag'` |
| `color` | `string` | sim | Hex `#RRGGBB`; usado no gráfico do Overview |
| `kind` | `'expense' \| 'income' \| 'both'` | sim | Default `'expense'`; filtra as opções no formulário |
| `archived` | `boolean` | sim | Default `false` |
| `isDefault` | `boolean` | sim | `true` nas 8 categorias-semente; impede exclusão definitiva |

**Seed obrigatório (FR-026)**: Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Assinaturas, Outros — todas com `isDefault: true` e cores distintas retiradas da paleta do design system.

**Transições de estado**

```
ativa ──arquivar──> arquivada ──reativar──> ativa
```

- Arquivar preserva todas as transações vinculadas e o rótulo exibido nelas.
- Uma categoria arquivada não aparece nos seletores de novos lançamentos, mas continua aparecendo nos filtros e relatórios de períodos que a contêm.
- Exclusão definitiva só é permitida se a categoria não tiver **nenhuma** transação, nenhum orçamento e nenhuma recorrência apontando para ela, e `isDefault === false`.

---

## Entidade: Account

Onde o dinheiro está.

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `id` | `string` | sim | UUID v4 |
| `name` | `string` | sim | 1 a 40 caracteres, único entre contas **ativas** (case-insensitive) |
| `initialBalanceCents` | `number` | sim | Inteiro, pode ser negativo, default `0` |
| `archived` | `boolean` | sim | Default `false` |
| `isDefault` | `boolean` | sim | `true` nas 3 contas-semente |

**Seed obrigatório (FR-026)**: Nubank, Itaú.

Mesmas regras de arquivamento e exclusão da `Category`.

**Saldo de uma conta** = `initialBalanceCents` + soma das receitas − soma das despesas daquela conta. O saldo acumulado global do FR-009 é a soma dos saldos de todas as contas, incluindo as arquivadas.

---

## Entidade: Budget

Teto mensal de gasto para uma categoria.

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `id` | `string` | sim | UUID v4 |
| `categoryId` | `string` | sim | Referencia `Category.id`; **único** entre orçamentos ativos — FR-017 |
| `limitCents` | `number` | sim | Inteiro, `> 0` |
| `startMonth` | `string` | sim | `YYYY-MM` — mês a partir do qual o limite vale |
| `createdAt` / `updatedAt` | `string` | sim | ISO 8601 |

**Invariantes**

- No máximo um `Budget` por `categoryId` (FR-017). Redefinir o limite **atualiza** o registro existente em vez de criar outro.
- O orçamento vale do `startMonth` em diante, indefinidamente, até ser alterado ou removido (User Story 3, cenário 1).
- Consultar um mês anterior ao `startMonth` mostra a categoria sem orçamento definido.

**Valores derivados** (calculados, nunca persistidos), para um `month` = `YYYY-MM`:

- `spentCents` = soma de `amountCents` das transações onde `type === 'expense'`, `categoryId` bate e `date` cai no mês (FR-018).
- `percentUsed` = `spentCents / limitCents * 100`.
- `remainingCents` = `limitCents - spentCents` (pode ser negativo).
- `status` (FR-016):

| Condição | `status` | Rótulo textual |
|---|---|---|
| `percentUsed < 80` | `'ok'` | "Dentro do limite" |
| `80 <= percentUsed <= 100` | `'warning'` | "Em atenção" |
| `percentUsed > 100` | `'exceeded'` | "Estourado" |

O rótulo textual é obrigatório na UI, além da cor (SC-007).

---

## Entidade: Recurrence

Modelo que gera transações periodicamente.

| Campo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `id` | `string` | sim | UUID v4 |
| `type` | `'income' \| 'expense'` | sim | Herdado pelas transações geradas |
| `amountCents` | `number` | sim | Mesmas regras de `Transaction.amountCents` |
| `description` | `string` | sim | 1 a 120 caracteres |
| `categoryId` | `string` | sim | Referencia `Category.id` |
| `accountId` | `string` | sim | Referencia `Account.id` |
| `notes` | `string \| null` | não | Copiado para as transações geradas |
| `frequency` | `'weekly' \| 'monthly' \| 'yearly'` | sim | FR-019 |
| `startDate` | `string` | sim | `YYYY-MM-DD`; primeira ocorrência |
| `endDate` | `string \| null` | não | Se definida, `>= startDate`; após ela nada é gerado (FR-019) |
| `status` | `'active' \| 'paused'` | sim | Default `'active'` — FR-023 |
| `lastGeneratedDate` | `string \| null` | sim | `null` enquanto nenhuma ocorrência foi materializada |
| `createdAt` / `updatedAt` | `string` | sim | ISO 8601 |

**Transições de estado**

```
active ──pausar──> paused ──retomar──> active
```

Pausar interrompe a geração a partir daquele momento e **não** remove transações já criadas. Retomar gera as ocorrências vencidas no intervalo em que esteve pausada — o `lastGeneratedDate` não avança enquanto pausada.

**Cálculo das ocorrências** (R-005), dada uma data `today`:

1. Ponto de partida: `startDate` se `lastGeneratedDate === null`; senão, a ocorrência seguinte a `lastGeneratedDate`.
2. Avanço conforme `frequency`: `weekly` = +7 dias; `monthly` = +1 mês com *clamp* no último dia do mês (FR-025); `yearly` = +1 ano com clamp em 29/02.
3. Para cada ocorrência com data `<= today` e (`endDate === null` ou data `<= endDate`): criar uma `Transaction` com `source: 'recurrence'`, `sourceRecurrenceId`, `occurrenceDate` igual à data da ocorrência e `date` igual a ela.
4. Antes de inserir, verificar se já existe transação com o mesmo par (`sourceRecurrenceId`, `occurrenceDate`) — se existir, pular (idempotência, FR-021).
5. Nenhuma ocorrência com data `> today` é materializada (FR-022).
6. Ao final, `lastGeneratedDate` recebe a data da última ocorrência gerada.

O clamp mensal é sobre o **dia de referência original** (`startDate`), não sobre a data anterior gerada: uma recorrência iniciada em 31/01 gera 28/02, depois 31/03 — e não 28/03.

---

## Agregado raiz: KashDatabase

Estrutura única persistida e alvo do export/import (FR-030).

| Campo | Tipo | Descrição |
|---|---|---|
| `schemaVersion` | `number` | Versão do formato; começa em `1` |
| `transactions` | `Transaction[]` | |
| `categories` | `Category[]` | |
| `accounts` | `Account[]` | |
| `budgets` | `Budget[]` | |
| `recurrences` | `Recurrence[]` | |
| `exportedAt` | `string` | Presente apenas no arquivo exportado |

**Regras de importação (FR-030)**

- Rejeitar arquivo com `schemaVersion` maior que o suportado, com mensagem explícita.
- Validar a estrutura antes de sobrescrever; um arquivo inválido nunca substitui a base existente.
- A importação **substitui** integralmente a base atual, mediante confirmação explícita do usuário.

---

## Diagrama de relacionamentos

```
Category 1 ──── N Transaction N ──── 1 Account
    │                  │
    │ 1                │ N (opcional)
    │                  │
    N                  1
 Budget           Recurrence ──── 1 Category
                       └───────── 1 Account
```
