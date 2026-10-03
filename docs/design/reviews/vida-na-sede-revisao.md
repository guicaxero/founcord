# Revisão de UI/UX — Vida na Sede

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md) e a
[especificação](../../product/specs/vida-na-sede.md).

## Especificação

- **Usuários:**
  - jogador com personagem vinculado (`sede:declare`);
  - Guardião (`sede:manage`).
- **Objetivo:** o Corvo escolhe as atividades entre missões; o Guardião
  resolve e registra o resultado.
- **Jogador (`/eu?aba=sede`):** cabeçalho com as atividades restantes e a regra
  do período, "Neste período", cartões de atividades com "Escolher" e
  "Períodos anteriores".
- **Guardião (`/dashboard/sede`):** nível da Sede e as abas "Para resolver",
  "Resolvidas" e "Atividades", com diálogos para resolver e editar.
- **Estados:**
  - sem personagem vinculado;
  - atividades do período já escolhidas (botões desabilitados, com a
    explicação no cabeçalho);
  - atividade já escolhida no período;
  - catálogo vazio, com "Importar atividades do nível 1";
  - nada para resolver;
  - carregando e erro.

## Validação renderizada

Ambiente local com D1 migrado e sessão `owner` vinculada a um personagem
sintético.

| Verificação | Resultado |
| --- | --- |
| Catálogo vazio | Estado com "Importar atividades do nível 1"; a importação traz as 6 atividades e o toast confirma. |
| Jogador | "Você tem 1 atividade disponível", "Sede nível 1" e a data de início do período. |
| Escolha com pergunta | O diálogo da Escriba exige a pergunta; depois de confirmar, a atividade aparece em "Neste período" como "Aguardando o Guardião" e os demais "Escolher" ficam desabilitados. |
| Guardião | "Para resolver (1)"; o diálogo mostra o efeito e o pedido; registrar zera a fila e o toast confirma. |
| Resultado para o jogador | "Resolvida", com o texto do resultado, o autor e a data. |
| 375 px | Sem rolagem horizontal; as quatro abas da área do jogador quebram em duas linhas com 44 px; os cartões ficam em uma coluna. |
| 1440 px | Cartões de atividades em três colunas. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Baixo | A descrição da área do jogador não mencionava a Sede. | Texto da página e metadados atualizados. |

## Pendências aceitas

- Publicação no Registro do Corvo do Discord e escolha de itens do Lojista vêm
  nas entregas seguintes.
- A rolagem é mostrada como números; a tabela do 2d20 do Zelador continua com
  o Guardião.
