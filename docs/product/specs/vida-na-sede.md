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

## Registro do Corvo (Discord)

- **Tópico do Corvo:** fica no vínculo do personagem. No painel de
  Personagens, o Guardião cola o link do tópico do Corvo no fórum Registro do
  Corvo, ou usa "Sugerir pelo nome", que lista os tópicos do fórum com o nome
  do personagem. O tópico só vale depois de salvo.
- **Publicações:** o bot publica no tópico quando o Corvo escolhe uma
  atividade (efeito, pedido e rolagem), quando o Guardião registra o
  resultado e quando a escolha é desfeita. As mensagens nunca mencionam
  ninguém (`allowed_mentions` vazio).
- **Sem tópico ligado:** a atividade fica só no portal, e o painel da Sede
  avisa o Guardião.
- **Entrega:** a publicação vai pela fila do Discord. Uma falha é repetida
  até seis vezes, sem bloquear a ação no portal.
- **Fórum:** configurado no Worker do Discord (`REGISTRO_DO_CORVO_CHANNEL_ID`).
  O bot precisa ver o fórum e enviar mensagens nos tópicos.

## Lojista: itens Comuns até um limite

- **Tipo de atividade:** "Itens do Lojista" (`shop`), com um limite de valor
  escrito como preço do Foundry. No nível 1, Preparar Suprimentos tem limite de
  `1 ss` (1 Xelim de Prata).
- **Escolha:**
  - o jogador vê os itens Comuns, ativos e com preço até o limite do catálogo
    do Lojista;
  - ajusta as quantidades (até 20 por item) e acompanha o total e o que ainda
    cabe;
  - o servidor confere tudo de novo e recusa itens indisponíveis ou acima do
    limite.
- **Entrega:**
  - quando o Guardião registra o resultado, o portal envia o comando
    `character.items.grant` ao mundo do personagem (módulo 0.12.0+);
  - o módulo cria os itens no ator do personagem, marcados com o ID da
    atividade, e reenviar não duplica nada;
  - a entrega aparece para o jogador e para o Guardião: a caminho, entregue ou
    falhou com o motivo;
  - em caso de falha (ex.: módulo antigo), "Entregar de novo" tenta outra vez.

## Atividades do nível 1

| NPC | Atividade | O jogador informa | Rolagem |
| --- | --- | --- | --- |
| Cozinheiro | Refeição Reforçada | — | — |
| Cervejeiro | Confraternizar | — | — |
| Zelador | Ajudar na Sede | — | 2d20 |
| Caçador | Treino de Caça | — | — |
| Lojista | Preparar Suprimentos | itens Comuns até 1 ss | — |
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
