# Revisão de UI/UX — Ordem manual e tags das Crônicas

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

- **Quem:** quem publica crônicas (`post:publish`) organiza; quem escreve
  (`post:create`) já pode pôr tags no rascunho; qualquer pessoa filtra.
- **Problema:** o arquivo segue só a data de publicação, então sequências
  (Crônica I, II, III) se espalham e as crônicas importantes afundam.
- **Objetivo:** escolher as crônicas que abrem o arquivo, na ordem desejada,
  e agrupar por tags (temporada, sequência, assunto) para filtrar.

### Fluxo

- Painel → Crônicas → "Organizar o arquivo" (só para quem publica) abre um
  diálogo com duas listas das crônicas **publicadas**:
  - **No topo do arquivo**, numerada: "↑ Subir", "↓ Descer" e "Tirar do topo";
  - **Pela data de publicação**: "Pôr no topo".
  - Cada crônica tem o campo "Tags" (separadas por vírgula).
  - "Salvar organização" grava tudo de uma vez; toast "Arquivo organizado".
- O editor de crônica ganha "Tags" (opcional, até 8, separadas por vírgula).
- Arquivo público: as fixadas primeiro, na ordem escolhida; depois as demais
  pela data. Acima da busca, o filtro "Todas" + uma opção por tag, com
  contagem. As tags aparecem nos cartões e no topo da crônica.
- Organizar não muda a versão do texto nem passa pela revisão: é
  apresentação, não conteúdo.

### Estados

Nenhuma crônica publicada (diálogo explica e só oferece "Fechar"); nenhuma
fixada (aviso pontilhado com o próximo passo); todas fixadas; erro ao salvar
(aviso com foco, listas preservadas); filtro + busca sem resultado ("Limpar
busca e tag"); arquivo sem tags (filtro não aparece).

### Acessibilidade

Botões de mover com nome completo ("Subir Crônica II"); depois de mover, o foco
continua no mesmo controle (ou no do outro sentido, quando chega à ponta);
mudança anunciada em região viva ("Crônica II agora é a 1ª do topo."); campo
de tags com rótulo que inclui o título; filtro com `aria-pressed`.

### Critérios de aceitação

- Fixar "Crônica II" e "Crônica I" nessa ordem faz o arquivo público começar
  por elas, nessa ordem, independentemente da data.
- Tags repetidas (sem diferenciar maiúsculas) e espaços extras são limpos.
- Só crônicas publicadas entram na organização (`422` para rascunho); jogador
  recebe `403`.
- Em 375 px, diálogo e filtro sem rolagem horizontal.

## Validação renderizada

Portal local com a migração 0033 e as crônicas reais da campanha (Crônica I a
V, que pela data apareciam de V para I).

| Verificação | Resultado |
| --- | --- |
| Diálogo em 375 px | 341 px de largura, sem rolagem horizontal. |
| Pôr no topo | I, II, III, V e IV fixadas nessa ordem; depois de cada clique o foco fica em "Tirar do topo" da crônica movida; região viva: "… foi para o topo, na 5ª posição." |
| Subir | "Subir Crônica IV" → IV vira a 4ª; foco continua em "Subir Crônica IV"; região viva: "… agora é a 4ª do topo." |
| Salvar | API pública devolve I, II, III, IV, V com `pinnedOrder` 1–5 e as tags "Crônicas de Rûl" e "Temporada 1"; depois as demais pela data. |
| Arquivo público | Filtro "Todas (7) / Crônicas de Rûl (5) / Temporada 1 (5)" ao lado da busca; "Temporada 1" com `aria-pressed="true"` mostra só a sequência, na ordem. Tags nos cartões. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Baixo | O filtro de tags ficava acima do rótulo da busca, invertendo a hierarquia usada no registro de missões. | Busca e filtro na mesma linha, como em Missões e Corvos. |

## Pendências aceitas

- Só crônicas publicadas entram na organização; rascunhos recebem tags no
  próprio editor e entram na ordem pela data quando publicados.
- O nome "Guardião da Chama AP" ao lado do autor é tratado no PR seguinte
  (Nome no portal e assinatura).
