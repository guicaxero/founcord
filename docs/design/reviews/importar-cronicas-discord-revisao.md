# Revisão de UI/UX — Importar crônicas do Discord

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

- **Usuário:** quem escreve crônicas (`post:create`); publicar direto exige
  `post:publish`.
- **Objetivo:** trazer para o portal as crônicas que já estão nos fóruns do
  Discord, com as imagens, sem reescrevê-las.
- **Fluxo:** "Importar do Discord" (ao lado de "Nova crônica") abre um diálogo:
  fórum (códice-dos-corvos, registros-dos-corvos e registros-das-missões
  primeiro) → lista de tópicos com data, busca, "Marcar N novos" e caixas de
  seleção (até 20 por vez; os já importados aparecem como "Já no portal" e não
  podem ser marcados) → "Como rascunho" (padrão) ou "Já publicadas, com a data
  original do Discord" → "Importar N tópicos".
- **Resultado:** no próprio diálogo, quantas crônicas entraram, quantas imagens
  foram copiadas e o motivo de cada tópico que ficou de fora.
- **Estados:** carregando fóruns e tópicos; erro do Discord; fórum vazio;
  mensagem vazia (Message Content Intent desligado); imagem que não pôde ser
  copiada; tópico já importado.

## Validação renderizada

Portal local com um Worker do Discord simulado.

| Verificação | Resultado |
| --- | --- |
| Fóruns | "🪶 \| códice-dos-corvos" vem selecionado; os três fóruns da Ordem aparecem antes dos demais, mesmo com emoji no nome. |
| Rótulo | O seletor tem o rótulo "Fórum" associado. |
| Tópicos | Lista do mais novo ao mais antigo, com data. |
| Mensagem vazia | "Tópico sem texto: O Discord devolveu a mensagem vazia. Ative o Message Content Intent…". |
| Importação | "2 crônicas importadas — Estão como rascunho na lista do painel. 2 imagens copiadas."; os tópicos passam a "Já no portal" e ficam desabilitados. |
| Crônica criada | Origem Discord, rascunho, capa copiada e o texto com "> Escrito por **Guardião da Chama**". |
| 375 px | Diálogo com 343 px, sem rolagem horizontal. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| — | Nenhum achado crítico, alto ou médio. | — |

## Pendências aceitas

- Só a mensagem inicial do tópico é importada (dito no diálogo).
- A leitura real depende do Message Content Intent e das permissões do bot nos
  fóruns (runbook do Discord).
