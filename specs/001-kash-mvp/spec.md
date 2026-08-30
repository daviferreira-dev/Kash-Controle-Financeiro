# Feature Specification: Kash — Controle Financeiro Pessoal (MVP)

**Feature Branch**: `001-kash-mvp`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Kash — app web de controle financeiro pessoal. MVP: (1) Overview/Dashboard com saldo total, gráfico do mês e últimas transações; (2) CRUD de transações (receita/despesa, categoria, conta, data, observações); (3) Orçamentos com limite por categoria e acompanhamento de consumo no mês; (4) Recorrências (mensal/semanal/anual) que geram transações automaticamente. Categorias: Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Assinaturas, Outros. Contas: Nubank, Itaú, Carteira (configuráveis)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar movimentações do dia a dia (Priority: P1)

Como pessoa que quer entender para onde vai seu dinheiro, eu registro cada receita e despesa informando valor, descrição, categoria, conta e data, e consulto essa lista depois para revisar, corrigir ou apagar lançamentos.

**Why this priority**: Sem lançamentos não existe nada para exibir, orçar ou projetar. É a base de dados de todas as outras histórias e, sozinha, já substitui uma planilha manual.

**Independent Test**: Pode ser testada integralmente abrindo o app pela primeira vez, criando uma despesa e uma receita, editando uma delas, excluindo a outra, recarregando a página e confirmando que a lista reflete exatamente as operações feitas.

**Acceptance Scenarios**:

1. **Given** o app aberto sem nenhum lançamento, **When** a pessoa cria uma despesa de R$ 42,90 em "Alimentação", conta "Nubank", data 29/08/2026, **Then** o lançamento aparece no topo da lista de transações, exibido como valor negativo em cor de despesa e com a data no formato DD/MM/AAAA.
2. **Given** uma lista com lançamentos, **When** a pessoa edita o valor de um lançamento de R$ 42,90 para R$ 55,00, **Then** a lista, o saldo e todos os totais derivados refletem R$ 55,00 imediatamente.
3. **Given** um lançamento existente, **When** a pessoa solicita a exclusão e confirma, **Then** o lançamento some da lista e o saldo é recalculado; se ela cancelar a confirmação, nada muda.
4. **Given** o formulário de novo lançamento aberto, **When** a pessoa tenta salvar sem informar valor, **Then** o app exibe erro no campo de valor e não cria o lançamento.
5. **Given** lançamentos criados em uma sessão anterior, **When** a pessoa volta ao app no mesmo navegador, **Then** todos os lançamentos continuam disponíveis sem necessidade de login.
6. **Given** a lista de transações com lançamentos de vários meses e categorias, **When** a pessoa filtra por mês, tipo (receita/despesa), categoria ou conta, **Then** a lista mostra apenas os lançamentos correspondentes e informa o total filtrado.

---

### User Story 2 - Ver a situação financeira em uma tela (Priority: P2)

Como pessoa que acabou de registrar seus gastos, eu abro o Overview e vejo, sem esforço, o saldo consolidado, quanto entrou e saiu no mês corrente, a divisão dos gastos por categoria e meus últimos lançamentos.

**Why this priority**: É o principal motivo de uso recorrente do app e transforma dados brutos em decisão, mas depende de existirem lançamentos (P1).

**Independent Test**: Com um conjunto conhecido de lançamentos, abrir o Overview e conferir que saldo, total de receitas, total de despesas, gráfico e lista de recentes correspondem aos números esperados.

**Acceptance Scenarios**:

1. **Given** lançamentos de receitas somando R$ 5.000,00 e despesas somando R$ 3.200,00 no mês corrente, **When** a pessoa abre o Overview, **Then** vê o saldo do período como R$ 1.800,00, além dos totais de entradas e saídas separados.
2. **Given** despesas distribuídas em várias categorias no mês, **When** a pessoa observa o gráfico do mês, **Then** cada categoria aparece com seu valor e sua participação percentual no total de despesas.
3. **Given** mais de 5 lançamentos registrados, **When** a pessoa abre o Overview, **Then** vê os lançamentos mais recentes em ordem decrescente de data e um caminho para a lista completa.
4. **Given** nenhum lançamento no mês corrente, **When** a pessoa abre o Overview, **Then** vê um estado vazio explicativo com ação para criar o primeiro lançamento, e não valores quebrados ou zeros ambíguos.
5. **Given** o Overview aberto no mês corrente, **When** a pessoa navega para o mês anterior, **Then** todos os números e o gráfico passam a refletir aquele mês.

---

### User Story 3 - Controlar gastos com orçamentos por categoria (Priority: P3)

Como pessoa que quer se conter em certas categorias, eu defino um teto mensal para cada categoria e acompanho quanto já consumi, sendo avisada visualmente quando me aproximo ou estouro o limite.

**Why this priority**: Agrega disciplina e é diferencial em relação a uma planilha, mas o app entrega valor sem ele.

**Independent Test**: Definir um orçamento de R$ 800,00 para "Alimentação", lançar despesas nessa categoria e verificar que o consumo, o percentual e o estado de alerta evoluem corretamente até e além do limite.

**Acceptance Scenarios**:

1. **Given** nenhum orçamento definido, **When** a pessoa define R$ 800,00 para "Alimentação", **Then** o orçamento passa a valer para o mês corrente e para os meses seguintes até ser alterado ou removido.
2. **Given** orçamento de R$ 800,00 em "Alimentação" e R$ 600,00 já gastos no mês, **When** a pessoa abre a tela de orçamentos, **Then** vê consumo de R$ 600,00, 75% do limite e restante de R$ 200,00.
3. **Given** um orçamento cujo consumo passou de 80% do limite, **When** a pessoa visualiza esse orçamento, **Then** ele é destacado como "em atenção".
4. **Given** um orçamento cujo consumo ultrapassou o limite, **When** a pessoa visualiza esse orçamento, **Then** ele é destacado como "estourado", com o valor excedente explícito.
5. **Given** um orçamento definido, **When** a pessoa consulta um mês passado, **Then** vê o consumo daquele mês contra o limite vigente, sem alterar o mês corrente.

---

### User Story 4 - Não relançar contas fixas todo mês (Priority: P4)

Como pessoa com contas fixas (aluguel, assinaturas, salário), eu cadastro uma recorrência com valor, categoria, conta e frequência, e o app passa a criar os lançamentos correspondentes nas datas certas, sem que eu precise digitar de novo.

**Why this priority**: Reduz muito o esforço recorrente, mas exige que o registro manual (P1) já esteja sólido, pois gera exatamente o mesmo tipo de dado.

**Independent Test**: Cadastrar uma recorrência mensal com início em data passada, abrir o app e confirmar que os lançamentos dos períodos vencidos foram criados uma única vez e aparecem na lista de transações identificados como originados de recorrência.

**Acceptance Scenarios**:

1. **Given** uma recorrência mensal de R$ 1.500,00 ("Moradia", conta "Itaú") com início em 05/06/2026, **When** a pessoa abre o app em 29/08/2026, **Then** existem lançamentos de 05/06, 05/07 e 05/08, e nenhum lançamento futuro de 05/09.
2. **Given** a mesma recorrência já processada, **When** a pessoa recarrega ou reabre o app no mesmo dia, **Then** nenhum lançamento duplicado é criado.
3. **Given** uma recorrência ativa, **When** a pessoa a pausa, **Then** nenhum novo lançamento é gerado a partir daí, e os lançamentos já criados permanecem intactos.
4. **Given** uma recorrência com data final definida, **When** essa data é ultrapassada, **Then** o app para de gerar lançamentos para ela.
5. **Given** um lançamento gerado por recorrência, **When** a pessoa o edita ou exclui, **Then** apenas aquele lançamento é afetado, e a recorrência continua válida para os períodos seguintes.
6. **Given** uma recorrência mensal com dia 31, **When** o mês corrente não possui dia 31, **Then** o lançamento é criado no último dia daquele mês.

---

### Edge Cases

- Lançamento com valor zero ou negativo digitado no campo de valor: rejeitado com mensagem clara (o sinal vem do tipo receita/despesa, não do número).
- Valor acima de R$ 99.999.999,99: rejeitado com mensagem, para evitar formatação quebrada.
- Data futura em um lançamento manual: aceita e computada no mês da própria data; o Overview daquele mês futuro a exibirá.
- Exclusão de uma categoria com lançamentos históricos: a categoria é arquivada, não apagada, e os lançamentos antigos preservam o rótulo.
- Exclusão de uma conta com lançamentos: mesma regra de arquivamento.
- Orçamento em categoria sem nenhum gasto: exibido com consumo de 0% e restante igual ao limite.
- Dois orçamentos para a mesma categoria no mesmo mês: impedido; definir de novo substitui o limite anterior.
- Recorrência com início muito antigo (ex.: 2 anos atrás): o app gera os lançamentos vencidos e informa quantos foram criados de uma vez.
- Navegador com armazenamento local desabilitado, cheio ou em modo privativo: o app avisa explicitamente que os dados não poderão ser salvos, em vez de falhar em silêncio.
- Mesma pessoa em outro navegador ou dispositivo: os dados não aparecem; a limitação é comunicada de forma visível.
- Virada de mês com o app aberto: ao voltar à tela, os períodos são recalculados para o mês corrente correto.

## Requirements *(mandatory)*

### Functional Requirements

**Transações**

- **FR-001**: O sistema MUST permitir criar um lançamento com tipo (receita ou despesa), valor, descrição, categoria, conta e data.
- **FR-002**: O sistema MUST permitir observações livres e opcionais em um lançamento.
- **FR-003**: O sistema MUST exigir valor maior que zero, descrição não vazia, categoria, conta e data válida, bloqueando o salvamento e indicando o campo inválido quando faltar algo.
- **FR-004**: Usuários MUST conseguir editar qualquer campo de um lançamento existente e excluir um lançamento mediante confirmação explícita.
- **FR-005**: O sistema MUST listar os lançamentos ordenados por data decrescente, com filtros por mês, tipo, categoria, conta e busca textual por descrição, exibindo o total dos itens filtrados.
- **FR-006**: O sistema MUST exibir valores monetários no formato R$ 0.000,00 e datas no formato DD/MM/AAAA em toda a interface.
- **FR-007**: O sistema MUST distinguir visualmente receitas de despesas por cor e sinal, sem depender apenas da cor para transmitir a informação.

**Overview**

- **FR-008**: O sistema MUST apresentar, para o mês selecionado, o total de receitas, o total de despesas e o saldo do período.
- **FR-009**: O sistema MUST apresentar o saldo acumulado considerando todos os lançamentos até a data corrente.
- **FR-010**: O sistema MUST apresentar a distribuição das despesas do mês por categoria, com valor e percentual de cada uma.
- **FR-011**: O sistema MUST exibir os lançamentos mais recentes do mês selecionado, com acesso à lista completa.
- **FR-012**: Usuários MUST conseguir navegar entre meses e ver todos os indicadores recalculados para o mês escolhido.
- **FR-013**: O sistema MUST exibir estados vazios explicativos com uma ação sugerida quando não houver dados para o período.

**Orçamentos**

- **FR-014**: Usuários MUST conseguir definir, alterar e remover um limite mensal por categoria de despesa.
- **FR-015**: O sistema MUST calcular, para o mês selecionado, o valor consumido, o percentual do limite e o valor restante de cada orçamento.
- **FR-016**: O sistema MUST sinalizar o estado de cada orçamento em três faixas — dentro do limite, em atenção (a partir de 80%) e estourado (acima de 100%) — sempre com rótulo textual além da cor.
- **FR-017**: O sistema MUST impedir mais de um orçamento vigente para a mesma categoria, substituindo o limite anterior quando redefinido.
- **FR-018**: O sistema MUST considerar apenas despesas do mês selecionado e da categoria correspondente no cálculo de consumo.

**Recorrências**

- **FR-019**: Usuários MUST conseguir cadastrar uma recorrência com tipo, valor, descrição, categoria, conta, frequência (semanal, mensal ou anual), data de início e data final opcional.
- **FR-020**: O sistema MUST gerar automaticamente os lançamentos de todas as ocorrências vencidas até a data corrente, ao abrir o app.
- **FR-021**: O sistema MUST garantir que cada ocorrência gere no máximo um lançamento, mesmo com reaberturas ou recarregamentos sucessivos.
- **FR-022**: O sistema MUST NOT gerar lançamentos de ocorrências com data futura.
- **FR-023**: Usuários MUST conseguir pausar, retomar, editar e excluir uma recorrência, sem que isso altere retroativamente os lançamentos já gerados.
- **FR-024**: O sistema MUST identificar, na lista de transações, os lançamentos originados de uma recorrência.
- **FR-025**: Quando o dia de vencimento não existir no mês (ex.: dia 31), o sistema MUST usar o último dia daquele mês.

**Categorias, contas e dados**

- **FR-026**: O sistema MUST oferecer as categorias iniciais Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Assinaturas e Outros, e as contas iniciais Nubank e Itaú. (A conta "Carteira" foi removida do seed: dinheiro em espécie não entra no fluxo de importação de extrato CSV, que é o caminho principal de uso.)
- **FR-027**: Usuários MUST conseguir criar, renomear e arquivar categorias e contas, preservando o histórico dos lançamentos já vinculados a elas.
- **FR-028**: O sistema MUST persistir todos os dados localmente no navegador, mantendo-os disponíveis entre sessões sem exigir cadastro ou login.
- **FR-029**: O sistema MUST avisar de forma visível quando não for possível gravar os dados localmente (armazenamento indisponível ou esgotado).
- **FR-030**: Usuários MUST conseguir exportar todos os seus dados em um arquivo e reimportá-los, para backup e migração entre navegadores.
- **FR-031**: O sistema MUST estar inteiramente em português do Brasil.
- **FR-032**: O sistema MUST ser utilizável em telas de celular e de desktop, mantendo todas as funções acessíveis nos dois formatos.

### Key Entities

- **Transação**: um movimento financeiro. Tipo (receita/despesa), valor, descrição, data, categoria, conta, observações opcionais, origem (manual ou recorrência) e referência à recorrência que a originou, quando aplicável.
- **Categoria**: rótulo de classificação de um gasto ou receita. Nome, ícone, cor de apoio e situação (ativa/arquivada).
- **Conta**: onde o dinheiro está. Nome, situação (ativa/arquivada) e, opcionalmente, saldo inicial.
- **Orçamento**: teto mensal de gasto para uma categoria. Categoria, valor-limite e vigência.
- **Recorrência**: modelo que gera transações periodicamente. Mesmos campos de uma transação, além de frequência, data de início, data final opcional, situação (ativa/pausada) e marcação da última ocorrência já gerada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa consegue registrar um lançamento completo em até 30 segundos, sem consultar ajuda.
- **SC-002**: A partir da abertura do app, a pessoa identifica seu saldo do mês e sua maior categoria de gasto em menos de 10 segundos.
- **SC-003**: 100% dos lançamentos registrados continuam presentes e corretos após fechar e reabrir o navegador.
- **SC-004**: Contas fixas cadastradas como recorrência não exigem digitação adicional nos meses seguintes e não produzem lançamentos duplicados em nenhuma reabertura do app.
- **SC-005**: Com 1.000 lançamentos registrados, abrir o Overview, filtrar a lista e salvar um novo lançamento continuam respondendo em menos de 1 segundo.
- **SC-006**: Todos os valores e datas exibidos seguem o padrão brasileiro, sem exceção em nenhuma tela.
- **SC-007**: Um orçamento estourado é identificado corretamente por quem usa o app mesmo sem distinguir cores, graças ao rótulo textual.
- **SC-008**: Todas as funções do MVP podem ser executadas em uma tela de celular de 390px de largura sem rolagem horizontal.

## Assumptions

- **Uso individual e local**: o MVP atende uma única pessoa em um único navegador. Não há cadastro, login, multiusuário nem sincronização entre dispositivos; a exportação/importação de arquivo (FR-030) é o mecanismo de backup e migração.
- **Sem integração bancária**: não há importação automática de extratos, Open Finance ou conexão com instituições financeiras nesta versão. A tela de importação de extrato existente nos mockups fica fora do MVP.
- **Moeda única**: todos os valores são em Real (BRL). Não há conversão de moedas.
- **Sem anexos**: comprovantes, fotos e arquivos anexados a lançamentos ficam fora do MVP.
- **Sem parcelamento**: compras parceladas não têm tratamento próprio; podem ser modeladas como uma recorrência com data final.
- **Sem transferências entre contas**: mover dinheiro entre contas próprias não é um tipo de lançamento nesta versão.
- **Geração de recorrências sob demanda**: as ocorrências vencidas são criadas quando a pessoa abre o app, não por um processo em segundo plano.
- **Mês de referência**: todos os agregados (Overview e orçamentos) usam o mês-calendário civil, do dia 1 ao último dia do mês.
- **Fuso horário**: as datas seguem o relógio local do dispositivo.
- **Design system definido**: a identidade visual "Premium Editorial Finance" (paleta, tipografia, formatação BRL) já está definida no projeto de design e é insumo, não objeto desta especificação.
- **Acessibilidade**: alvo AA — contraste adequado, navegação por teclado e informação nunca transmitida apenas por cor.
