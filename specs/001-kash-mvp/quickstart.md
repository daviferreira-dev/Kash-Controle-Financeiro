# Quickstart — Kash MVP

**Feature**: `001-kash-mvp` | **Date**: 2026-08-29

Guia de execução e validação ponta a ponta. Não contém código de implementação — isso pertence a `tasks.md` e à fase de implementação.

## Pré-requisitos

- **Node.js 20 LTS ou superior** (`node --version`)
- **npm 10+** (acompanha o Node 20)
- Um navegador moderno com armazenamento local habilitado (Chrome, Edge, Firefox ou Safari recentes)
- Nenhum banco de dados, conta ou chave de API é necessário — o MVP roda inteiramente no navegador

## Instalação

```bash
npm install
```

## Rodando em desenvolvimento

```bash
npm run dev
```

Abre em `http://localhost:5173`. Na primeira execução o app popula automaticamente as 8 categorias e as 3 contas padrão (FR-026).

## Comandos disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Type-check e build de produção em `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm test` | Executa a suíte Vitest uma vez |
| `npm run test:watch` | Vitest em modo observação |
| `npm run lint` | ESLint sobre `src/` |
| `npm run typecheck` | `tsc --noEmit` |

## Cenários de validação

Cada cenário abaixo valida uma user story da [spec](./spec.md) e pode ser executado de forma independente.

### V1 — CRUD de transações (User Story 1, P1)

1. Abra o app em uma janela anônima (base limpa).
2. Crie uma **despesa**: R$ 42,90 · "Almoço no restaurante" · Alimentação · Nubank · 29/08/2026.
3. Crie uma **receita**: R$ 5.000,00 · "Salário" · Outros · Itaú · 05/08/2026.
4. **Esperado**: ambas aparecem na lista ordenadas por data decrescente (a despesa primeiro); a despesa exibe sinal negativo e cor de despesa, a receita o oposto; datas em DD/MM/AAAA; valores em R$ 0.000,00.
5. Edite a despesa para R$ 55,00. **Esperado**: lista e todos os totais refletem R$ 55,00 imediatamente.
6. Tente salvar um novo lançamento com o valor vazio. **Esperado**: erro no campo de valor, nada é criado.
7. Exclua a receita, primeiro cancelando a confirmação e depois confirmando. **Esperado**: cancelar não muda nada; confirmar remove e recalcula o saldo.
8. Recarregue a página (F5). **Esperado**: a despesa de R$ 55,00 continua lá (FR-028).
9. Aplique os filtros de mês, tipo, categoria e conta. **Esperado**: a lista responde a cada filtro e mostra o total dos itens filtrados.

### V2 — Overview (User Story 2, P2)

1. Partindo de uma base limpa, crie receitas somando **R$ 5.000,00** e despesas somando **R$ 3.200,00**, todas em agosto/2026, distribuídas entre pelo menos 3 categorias.
2. Abra o Overview.
3. **Esperado**: saldo do período **R$ 1.800,00**; entradas e saídas exibidas separadamente; o gráfico mostra cada categoria com valor e percentual, somando 100%; os lançamentos recentes aparecem em ordem decrescente com link para a lista completa.
4. Navegue para julho/2026. **Esperado**: todos os números e o gráfico passam a refletir julho (zerados, se não houver lançamentos).
5. Em um mês sem lançamentos. **Esperado**: estado vazio explicativo com ação para criar o primeiro lançamento — nunca valores quebrados (FR-013).

### V3 — Orçamentos (User Story 3, P3)

1. Defina um orçamento de **R$ 800,00** para Alimentação.
2. Lance despesas de Alimentação somando **R$ 600,00** no mês corrente.
3. **Esperado**: consumo R$ 600,00 · **75%** · restante R$ 200,00 · status "Dentro do limite".
4. Lance mais **R$ 50,00** em Alimentação (total R$ 650,00 → 81%). **Esperado**: status muda para **"Em atenção"**, com rótulo textual visível além da cor.
5. Lance mais **R$ 200,00** (total R$ 850,00 → 106%). **Esperado**: status **"Estourado"**, com o excedente de R$ 50,00 explícito.
6. Redefina o limite da mesma categoria para R$ 1.000,00. **Esperado**: o limite anterior é substituído, e não criado um segundo orçamento (FR-017).
7. Consulte um mês passado. **Esperado**: mostra o consumo daquele mês contra o limite vigente, sem alterar o mês corrente.

### V4 — Recorrências (User Story 4, P4)

1. Cadastre uma recorrência **mensal**: despesa de R$ 1.500,00 · "Aluguel" · Moradia · Itaú · início **05/06/2026**, sem data final.
2. Recarregue o app (com a data do sistema em 29/08/2026).
3. **Esperado**: existem exatamente 3 lançamentos — 05/06, 05/07 e 05/08 — marcados como originados de recorrência na lista; **nenhum** lançamento de 05/09 (FR-022).
4. Recarregue novamente. **Esperado**: nenhum lançamento duplicado; a contagem permanece 3 (FR-021).
5. Pause a recorrência e recarregue. **Esperado**: nenhum lançamento novo; os 3 existentes intactos.
6. Exclua o lançamento de 05/07 e recarregue. **Esperado**: ele **não** é recriado; a recorrência continua válida para os meses seguintes.
7. Cadastre uma recorrência mensal iniciando em **31/01/2026**. **Esperado**: gera 31/01, **28/02**, 31/03 — o clamp de fim de mês do FR-025, sem arrastar o dia para trás nos meses seguintes.

### V5 — Persistência, backup e limites

1. Exporte os dados em Configurações. **Esperado**: baixa um arquivo JSON com todos os registros.
2. Limpe o armazenamento do navegador e importe o arquivo. **Esperado**: a base volta idêntica, mediante confirmação explícita (FR-030).
3. Tente importar um arquivo inválido. **Esperado**: mensagem de erro clara e a base atual **permanece intacta**.
4. Abra o app em uma janela com armazenamento bloqueado. **Esperado**: aviso visível de que os dados não poderão ser salvos, sem falha silenciosa (FR-029).

### V6 — Responsividade e acessibilidade

1. Abra o app em viewport de **390px** de largura.
2. **Esperado**: todas as funções acessíveis, sem rolagem horizontal em nenhuma tela (SC-008).
3. Navegue por todos os formulários apenas com **Tab / Shift+Tab / Enter**. **Esperado**: foco visível e todas as ações alcançáveis.
4. Simule visão sem distinção de cores (filtro de escala de cinza no DevTools). **Esperado**: receitas, despesas e o status "Estourado" continuam identificáveis pelos rótulos e sinais (FR-007, SC-007).

## Teste automatizado

```bash
npm test
```

A suíte cobre obrigatoriamente a lógica de domínio pura: conversão e formatação monetária, aritmética de datas com clamp de fim de mês, geração idempotente de recorrências, faixas de status de orçamento e agregações do Overview (R-008).

## Validação de desempenho (SC-005)

1. Em Configurações, importe um arquivo com **1.000 transações** (o repositório inclui `fixtures/seed-1000.json` para isso).
2. **Esperado**: abrir o Overview, aplicar filtros na lista e salvar um novo lançamento respondem em **menos de 1 segundo** cada.
