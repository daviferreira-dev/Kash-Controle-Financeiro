# Modelos de importação

O Kash tem **duas importações diferentes**, em *Ajustes*:

| Onde | Formato | O que faz |
|---|---|---|
| **Backup dos dados → Importar dados** | JSON do Kash | Restaura um backup completo. Substitui tudo: lançamentos, categorias, contas, orçamentos e recorrências. |
| **Importar extrato (CSV)** | CSV do banco | Lê o extrato e cria os lançamentos, sugerindo categoria pela descrição. Você escolhe entre substituir os lançamentos ou somar aos existentes. |

---

## 1. Importar extrato do banco (CSV)

**É o caminho recomendado para trazer seus dados reais.**

No app do Nubank: *Conta → Histórico → ícone de exportar → CSV*, escolhendo o período. Depois, no Kash: *Ajustes → Importar extrato (CSV)*.

O arquivo precisa ter um cabeçalho com, no mínimo, as colunas **Data**, **Valor** e **Descrição**. A ordem não importa, e o parser também aceita:

- separador `,` ou `;`
- data em `DD/MM/AAAA`, `DD-MM-AAAA` ou `AAAA-MM-DD`
- valor com ponto (`-13.53`) ou vírgula (`-13,53`) decimal
- coluna **Identificador** (opcional): quando existe, é usada para de-duplicação exata

O **sinal do valor define o tipo**: negativo vira despesa, positivo vira receita.

[`fixtures/exemplo-extrato-nubank.csv`](../fixtures/exemplo-extrato-nubank.csv) mostra o formato, com dados fictícios.

### Atualizando o extrato toda semana

Se você exporta o mês inteiro até a data corrente, cada arquivo repete tudo que já veio antes. Use sempre **Adicionar** (o padrão): o Kash pula o que já existe, comparando pelo campo `Identificador`. Reimportar o mesmo arquivo por engano não cria nada nem altera o saldo.

**Não use "Substituir tudo" nessa rotina.** Ele apaga *todos* os lançamentos, incluindo os que você digitou à mão, os de outras contas e os gerados por recorrências. Ele serve só para o primeiro carregamento ou para recomeçar do zero.

### Detecção automática de recorrências

Depois de cada importação, o Kash analisa **todo o histórico** procurando lançamentos que se repetem: mesmo destinatário, intervalo regular (semanal, mensal ou anual) e valores próximos. Ele agrupa mesmo quando a descrição muda entre os meses: `IMOBILIARIA DANELLI LTDA` e `IMOBILIARIA DANELLI` caem no mesmo padrão, assim como `IFOOD *PEDIDO 8213` e `IFOOD *PEDIDO 9471`.

O resultado aparece no aviso da importação e em *Recorrências → Padrões encontrados no seu histórico*, com a frequência, o valor típico, a faixa observada (útil em contas que variam, como luz) e a próxima data esperada. Nada é criado sozinho: você confirma com **Criar recorrência** ou descarta com **Não é recorrência**, e o descarte fica gravado, para o padrão não voltar a aparecer na próxima importação.

**As recorrências criadas assim nascem pausadas.** É proposital: os lançamentos passados já estão no histórico, e gerar os próximos duplicaria o que vai chegar no extrato da semana seguinte. Pausada, a recorrência documenta a conta fixa e mostra o que ainda vai cair no mês, sem mexer nos números. Ative apenas se você parar de importar o extrato dessa conta.

Um ponto de atenção relacionado: se você **ativar** uma recorrência (aluguel, assinatura) e esse mesmo pagamento também vier no extrato, os dois viram lançamentos separados e a despesa conta em dobro. Escolha um caminho por conta fixa: ou a recorrência ativa, ou o extrato.

### Por que CSV e não o PDF do extrato

O PDF é diagramado em colunas visuais. Ao virar texto, os campos colam uns nos outros. No extrato real testado, `Conta: 13004481-6` ficava grudado em `175,00`, sem delimitador que permitisse separar com segurança. Para dado financeiro isso é inaceitável: o risco é importar o valor errado. O CSV tem colunas de verdade e um id por transação.

> **Nunca versione seus extratos.** Guarde-os em `private/`. O `.gitignore` bloqueia essa pasta inteira, além de `kash-backup-*.json` e `*.ofx`, porque esses arquivos contêm CPF, números de conta e nomes de terceiros.

---

## 2. Backup completo (JSON)

O botão **Importar dados** restaura o arquivo gerado por *Exportar dados*.

- O formato aceito é o **JSON do próprio Kash**.
- A importação **substitui integralmente** a base atual, não soma lançamentos. Por isso o app pede confirmação explícita antes.

## O modelo

[`fixtures/modelo-importacao.json`](../fixtures/modelo-importacao.json) é um arquivo válido e completo, pronto para abrir em qualquer editor e adaptar. Ele contém 5 lançamentos, 8 categorias, 3 contas, 1 orçamento e 1 recorrência.

Para usar: edite o arquivo e vá em **Ajustes → Importar dados**.

## Formato

```jsonc
{
  "schemaVersion": 1,          // obrigatório; não altere
  "transactions": [ … ],
  "categories":   [ … ],
  "accounts":     [ … ],
  "budgets":      [ … ],
  "recurrences":  [ … ]
}
```

As cinco coleções são obrigatórias, mesmo que vazias (`[]`). Um arquivo sem alguma delas é recusado, e a base atual permanece intacta.

### Transação

```jsonc
{
  "id": "uuid",                    // único no arquivo
  "type": "expense",               // "income" (receita) ou "expense" (despesa)
  "amountCents": 4290,             // ← EM CENTAVOS, inteiro e SEMPRE positivo
  "description": "Almoço no restaurante",
  "date": "2026-08-29",            // AAAA-MM-DD
  "categoryId": "uuid de uma categoria deste mesmo arquivo",
  "accountId":  "uuid de uma conta deste mesmo arquivo",
  "notes": null,                   // ou texto
  "source": "manual",              // "manual" ou "recurrence"
  "sourceRecurrenceId": null,      // preencher só quando source = "recurrence"
  "occurrenceDate": null,          // idem
  "createdAt": "2026-08-29T12:00:00.000Z",
  "updatedAt": "2026-08-29T12:00:00.000Z"
}
```

**Os dois erros mais fáceis de cometer:**

1. **Valor.** `amountCents` é inteiro em centavos, nunca reais com decimal. R$ 42,90 é `4290`, não `42.90`. Um `42.90` aqui vira quatro mil e duzentos e noventa reais.
2. **Sinal.** O valor é sempre positivo. Quem define entrada ou saída é o campo `type`. Um `amountCents` negativo é recusado.

Datas são civis (`AAAA-MM-DD`), sem hora e sem fuso. Só `createdAt`/`updatedAt` são instantes ISO completos.

### Categoria e conta

```jsonc
{ "id": "uuid", "name": "Alimentação", "icon": "utensils", "color": "#a03f2d",
  "kind": "expense", "archived": false, "isDefault": true }

{ "id": "uuid", "name": "Nubank", "initialBalanceCents": 0,
  "archived": false, "isDefault": false }
```

`kind` é `"expense"`, `"income"` ou `"both"`. `color` precisa ser hex `#RRGGBB`. `initialBalanceCents` pode ser negativo.

Os `categoryId` e `accountId` das transações têm que apontar para ids que existam **neste mesmo arquivo**. Como a importação substitui tudo, referências para ids da base antiga ficariam órfãs.

### Orçamento e recorrência

```jsonc
{ "id": "uuid", "categoryId": "uuid", "limitCents": 80000, "startMonth": "2026-08",
  "createdAt": "…", "updatedAt": "…" }

{ "id": "uuid", "type": "expense", "amountCents": 150000, "description": "Aluguel",
  "categoryId": "uuid", "accountId": "uuid", "notes": null,
  "frequency": "monthly",          // "weekly" | "monthly" | "yearly"
  "startDate": "2026-08-10", "endDate": null,
  "status": "active",              // "active" | "paused"
  "lastGeneratedDate": "2026-08-10",  // até onde já foi gerado; null se nada ainda
  "createdAt": "…", "updatedAt": "…" }
```

No máximo **um orçamento por categoria**.

`lastGeneratedDate` merece cuidado: ao abrir o app, a recorrência gera todas as ocorrências entre essa data e hoje. Se você deixar `null` numa recorrência que começou há dois anos, o Kash vai criar 24 lançamentos de uma vez.

## Ainda não suportado

Importação de **OFX** e de **PDF** de extrato. Para trazer dados do banco, use o CSV descrito na seção 1.
