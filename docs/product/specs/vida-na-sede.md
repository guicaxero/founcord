# Vida na Sede

## Objetivo

Entre uma missão e outra, cada Corvo escolhe no portal as atividades que faz
na Sede da Ordem. O Guardião resolve cada atividade e registra o resultado. O
portal deixa de ser só ficha e consulta e passa a fazer parte da rotina da
Ordem.

## Regras (texto da campanha)

- **Quantidade:** o nível da Sede define quantas atividades cada Corvo faz por
  período: nível 1 → 1 atividade, até nível 4 → 4 atividades.
- **Prazo:** a atividade é declarada antes da inscrição numa nova missão. Quem
  se inscreve sem declarar fica sem atividade naquele período.
- **Repetição:** no mesmo período, um Corvo não repete a mesma atividade.
- **Disponibilidade:** as atividades dependem dos recursos, instalações e
  membros atuais da Sede. Novas atividades aparecem conforme a Sede sobe de
  nível.
- **Resolução:** o Guardião resolve e registra o efeito no Registro do Corvo.

## Decisões

- **Período:**
  - termina na inscrição do Corvo numa missão da campanha (inscrições
    retiradas não contam);
  - o que ele declara depois disso já conta para o intervalo seguinte;
  - sem inscrição anterior, o período vem desde o começo.
- **Repetição:** vale dentro do mesmo período.
- **Rolagens:** atividades com rolagem (ex.: Zelador, 2d20) são roladas pelo
  portal, no servidor, no momento da escolha. O Guardião usa o resultado para
  resolver.
- **Personagem:** só quem tem personagem vinculado escolhe atividades. A
  escolha guarda o nome do personagem naquele momento.
- **Entregas seguintes:**
  - Registro do Corvo no Discord: link do tópico no vínculo do personagem e
    publicação da escolha e do resultado;
  - Lojista: escolha de itens Comuns até 1 xelim no catálogo, entregues no
    Foundry pelo módulo depois da aprovação do Guardião.

## Atividades do nível 1

| NPC | Atividade | O jogador informa | Rolagem |
| --- | --- | --- | --- |
| Cozinheiro | Refeição Reforçada | — | — |
| Cervejeiro | Confraternizar | — | — |
| Zelador | Ajudar na Sede | — | 2d20 |
| Caçador | Treino de Caça | — | — |
| Lojista | Preparar Suprimentos | pedido opcional | — |
| Escriba | Pesquisa | pergunta obrigatória | — |

O Guardião importa essa lista no painel e pode editar o texto, desativar
atividades e criar as dos níveis seguintes (nível mínimo, o que o jogador
informa e a rolagem automática).

## Interface

- **Jogador (`/eu?aba=sede`):**
  - cabeçalho com "Você tem N atividades disponíveis", o nível da Sede e a
    regra do período;
  - "Neste período": atividades escolhidas, com situação (aguardando o
    Guardião ou resolvida), pedido, rolagem e resultado;
  - "Desfazer" enquanto não for resolvida;
  - cartões das atividades disponíveis (NPC, nome, descrição e efeito) com
    "Escolher";
  - o diálogo de escolha pede a pergunta ou o pedido quando a atividade exige;
  - "Períodos anteriores", com os resultados.
- **Guardião (`/dashboard/sede`):**
  - nível da Sede;
  - abas "Para resolver", "Resolvidas" e "Atividades";
  - "Resolver" mostra o efeito, o pedido e a rolagem e grava o resultado, que
    pode ser corrigido depois;
  - "Descartar" devolve a escolha ao Corvo;
  - o catálogo traz "Importar atividades do nível 1", "Nova atividade" e
    "Editar".
- **Permissões:**
  - `sede:declare` para quem lê a própria ficha;
  - `sede:manage` para mestre, gestor, administrador e dono.
