# Kash — Controle Financeiro

Aplicação web de controle financeiro pessoal, em português do Brasil, que roda **inteiramente no navegador**. Sem servidor, sem conta, sem login — os dados vivem no `localStorage` da própria máquina.

> **Seus dados ficam só neste navegador.** Se você limpar os dados do site, trocar de navegador ou de computador, eles não vão junto — use **Ajustes → Exportar dados** para fazer backup.

## O que ele faz

- **Visão geral** — saldo acumulado, entradas e saídas do mês, distribuição das despesas por categoria (donut), tendência dos últimos meses (linha), insights automáticos e lançamentos recentes.
- **Transações** — receitas e despesas com categoria, conta, data e observações; filtros por mês, tipo, categoria, conta e busca textual; lista agrupada por dia com subtotal e renderização em lotes; desfazer ao excluir.
- **Orçamentos** — teto mensal por categoria, com acompanhamento do consumo e alerta em três faixas (dentro do limite, atenção a partir de 80%, estourado). Sugestões de teto a partir do histórico, com projeção do mês corrente.
- **Recorrências** — contas fixas (aluguel, assinaturas, salário) que viram lançamentos automaticamente nas datas certas, sem duplicar. Detecção de recorrências candidatas a partir dos lançamentos existentes.
- **Importação de extrato (CSV)** — importa o extrato do Nubank e formatos equivalentes no modo "Adicionar", com de-duplicação exata pelo identificador do banco. Parser tolerante na entrada, rígido na saída: uma linha que não vira transação válida é reportada, nunca adivinhada.
- **Ajustes** — saldo inicial das contas, exportar/importar backup em JSON, gerenciar categorias e contas.

## Stack

TypeScript em modo `strict`, React 18, Vite 5, Tailwind CSS 3, React Router 6 e Framer Motion. Persistência em `localStorage` atrás de uma interface de repositório assíncrona.

Sem biblioteca de datas, de dinheiro, de estado ou de gráficos — cada uma foi avaliada e recusada, com a justificativa registrada em [`specs/001-kash-mvp/research.md`](specs/001-kash-mvp/research.md). Os gráficos são SVG escrito à mão.

## Começando

Requer **Node.js 20+**.

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173` (porta fixa — o `localStorage` é isolado por origem, então deixar o Vite escolher a porta esconderia os dados já salvos). Na primeira execução o app cria as 8 categorias e as 3 contas padrão.

### Atalho na área de trabalho (Windows)

Para rodar o app com um clique — útil para subir o extrato toda semana:

```powershell
npm run atalho
```

Isso cria **"Kash — Controle Financeiro"** na área de trabalho. Ao abrir, ele sobe o servidor e abre o navegador em `http://localhost:5173`. Feche a janela de terminal para parar o servidor.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Type-check e build de produção em `dist/` |
| `npm run build:demo` | Build da versão demo (dados fictícios) — ver abaixo |
| `npm run preview` | Serve o build de produção localmente |
| `npm run preview:demo` | Build da demo e serve localmente |
| `npm test` | Executa a suíte de testes |
| `npm run test:watch` | Testes em modo observação |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run atalho` | Cria o atalho do app na área de trabalho (Windows) |

## Arquitetura

A separação que importa não é frontend/backend — não há backend —, e sim:

```
src/domain/   ·  Lógica de negócio pura. Sem React, sem I/O, relógio por parâmetro.
src/lib/      ·  Utilitários puros: dinheiro, datas, erros, ids.
src/storage/  ·  Persistência isolada atrás de `Repository<T>`.
src/state/    ·  Context + useReducer, hidratado do repositório.
src/components/, src/pages/  ·  Apresentação.
src/assets/   ·  Imagens empacotadas pelo Vite (marca em `src/assets/brand/`).
src/demo/     ·  Gerador do dataset fictício da versão demo.
```

Fora de `src/`:

```
public/       ·  Servido como está — favicons claro/escuro.
scripts/      ·  Utilitários de máquina: o atalho de área de trabalho.
fixtures/     ·  Dados de exemplo fictícios usados por testes e documentação.
docs/         ·  Notas de uso — ver docs/importacao.md.
private/      ·  Extratos e backups reais. Fora do Git (.gitignore).
specs/        ·  Especificação, plano e decisões técnicas.
```

Nenhum componente acessa `localStorage` diretamente. A interface do repositório é assíncrona desde o início, mesmo com o `localStorage` resolvendo na hora — é o que permite trocar por Supabase ou IndexedDB depois mexendo em um único arquivo.

### Duas invariantes que atravessam o projeto

1. **Dinheiro é sempre inteiro, em centavos.** Somar `float` acumula erro de IEEE-754 e faz um orçamento estourar por R$ 0,01 depois de algumas centenas de lançamentos.
2. **Data é sempre a string `YYYY-MM-DD`**, sem hora e sem fuso. Guardar timestamp faz a despesa do dia 01 aparecer no mês anterior em UTC-3. De quebra, a string ordena na ordem cronológica, o que torna filtro por mês uma comparação de strings.

## Testes

```bash
npm test
```

A cobertura é densa onde o erro é caro: aritmética monetária, aritmética de datas com clamp de fim de mês, geração idempotente de recorrências, de-duplicação da importação de CSV, faixas de status de orçamento e agregações do Overview. Os testes de componente cobrem os cenários de aceitação das user stories.

## Documentação do projeto

A especificação, o plano e as decisões técnicas vivem em [`specs/001-kash-mvp/`](specs/001-kash-mvp/):

- [`spec.md`](specs/001-kash-mvp/spec.md) — requisitos e critérios de aceitação
- [`plan.md`](specs/001-kash-mvp/plan.md) — plano de implementação
- [`research.md`](specs/001-kash-mvp/research.md) — decisões técnicas e alternativas recusadas
- [`data-model.md`](specs/001-kash-mvp/data-model.md) — entidades e invariantes
- [`quickstart.md`](specs/001-kash-mvp/quickstart.md) — cenários de validação manual

O passo a passo das duas importações (extrato CSV e backup JSON) está em [`docs/importacao.md`](docs/importacao.md).

## Demo e deploy

O app é 100% estático: o build gera `dist/` e qualquer host de site estático serve. Como o roteamento é no cliente (React Router), o host precisa devolver `index.html` para qualquer rota — cada plataforma tem seu arquivo de config no repo:

- **Cloudflare** (Workers/Pages): `wrangler.jsonc` — `assets.not_found_handling: "single-page-application"`.
- **Netlify**: `netlify.toml` — `[[redirects]]` de `/*` para `/index.html`.
- **Vercel**: `vercel.json` — `rewrites` de `/(.*)` para `/index.html`.

### Versão demo

`npm run build:demo` faz o build no modo `demo`. Nesse modo, numa base ainda vazia, o app carrega um **dataset fictício** gerado em `src/demo/demoData.ts` — ~6 meses de lançamentos, orçamentos nas três faixas de status e recorrências —, ancorado na data de hoje, então o link publicado nunca fica "parado no tempo". Uma faixa no topo deixa claro que os dados são fictícios e traz um botão para recarregá-los.

O gerador é determinístico: todo visitante vê os mesmos números. Cada navegador guarda a própria cópia no `localStorage` e pode mexer à vontade sem afetar os outros.

Deploy em um clique (Netlify / Cloudflare Pages / Vercel):

| Campo | Valor |
|---|---|
| Build command | `npm run build:demo` |
| Publish directory / output | `dist` |
| Deploy command (só no fluxo Cloudflare Workers Builds) | `npx wrangler deploy` |
| Node version | 20 (`.nvmrc`) |

No Cloudflare Pages clássico não há deploy command — ele publica o `dist/` sozinho. No fluxo mais novo (Workers Builds) o deploy command é `npx wrangler deploy`, que lê o `wrangler.jsonc`.

O build normal (`npm run build`) **não** carrega dados fictícios — abre no estado vazio, com as 8 categorias e 3 contas padrão.

## Fora do escopo desta versão

Anexos de comprovante, parcelamento, transferência entre contas, múltiplas moedas, multiusuário e sincronização entre dispositivos.
