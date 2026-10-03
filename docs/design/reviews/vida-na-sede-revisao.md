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
| Registro do Corvo (Personagens) | O cartão do personagem mostra "Sem tópico ligado"; salvar um link troca para "O bot publica neste tópico…" com "Abrir tópico no Discord" e "Remover tópico". |
| Sugestão sem Discord | "Sugerir pelo nome" sem a conexão local mostra o aviso "A conexão com o Discord ainda não está configurada." sem perder o que estava na tela. |
| Painel da Sede | Corvo sem tópico mostra o aviso "Sem tópico no Registro do Corvo" no cartão da atividade. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Baixo | A descrição da área do jogador não mencionava a Sede. | Texto da página e metadados atualizados. |

## Pendências aceitas

- A escolha de itens do Lojista vem na entrega seguinte.
- As sugestões de tópico só aparecem com o portal ligado ao Worker do Discord
  (produção); localmente, o aviso de conexão é o comportamento esperado.
- A rolagem é mostrada como números; a tabela do 2d20 do Zelador continua com
  o Guardião.
