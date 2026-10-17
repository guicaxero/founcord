# Revisão de UI/UX — Importar registros de missão do Discord

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

- **Quem:** quem publica missões (`mission:publish`).
- **Problema:** o histórico das missões antigas está no fórum
  registros-das-missões do Discord; recadastrar tudo à mão no portal
  duplicaria trabalho.
- **Fluxo:** Missões → "Importar do Discord" → fórum (registros-das-missões
  primeiro) → marcar até 20 tópicos → para cada marcado, "Situação"
  (Concluída por padrão, Fracassada ou Em andamento) → "Importar N missões".
  Resultado no próprio diálogo, com o motivo de cada tópico que ficou de fora
  e avisos (número repetido).
- **Dados:** número e nome pelo título; região pela linha "Local:" ("Não
  informada" sem ela); chamado = mensagem inicial sem negrito; relato = a
  mensagem inteira quando passa de 1.200 caracteres; capa = primeira imagem;
  datas de publicação e de registro = data do tópico.
- **Estados:** fóruns carregando/erro; fórum sem tópicos; tópico já no
  registro (desabilitado, selo "Já no registro"); limite de 20; mensagem vazia
  (Message Content Intent); número repetido (entra sem número, com aviso).
- **Acessibilidade:** cada seletor de situação tem rótulo com o título do
  tópico; contagem em região viva; resultado em `Notice` com `role="status"`.

## Validação renderizada

Portal local apontando para um Worker do Discord simulado, com três tópicos.

| Verificação | Resultado |
| --- | --- |
| Fórum | "📜 \| registros-das-missões" vem escolhido; tópicos do mais novo ao mais antigo, com data; "3 ainda fora do registro". |
| Situação por tópico | Ao marcar, aparece "Situação" (rótulo acessível "Situação de Missão Nº 003 - A Torre Partida"); botão "Importar 3 missões". |
| Resultado | "3 missões registradas"; aviso "O número 1 já estava no registro; a missão entrou sem número."; os tópicos passam a "Já no registro". |
| Dados | "A Torre Partida", N° 3, Em andamento, região "Ruínas da Torre Partida" (de "**Local:**"), registrada em 10/09/2026; sem "Local:" → "Não informada". |
| 375 px | Diálogo com 341 px, sem rolagem horizontal. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| — | Nenhum achado crítico, alto ou médio. | — |

## Pendências aceitas

- A situação não vem das tags do fórum: o Worker do Discord não devolve as
  tags aplicadas aos tópicos. O mestre escolhe no diálogo.
- Missões antigas que já tinham sido importadas como crônicas (do mesmo
  fórum) continuam em Crônicas; arquive-as lá se não quiser os dois registros.
- Os participantes de cada missão importada são marcados depois, no registro
  da missão.
