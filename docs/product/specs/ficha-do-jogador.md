# Ficha do jogador no portal

## Objetivo

O jogador consulta a ficha completa do personagem vinculado na área do
jogador (`/eu?aba=personagem`), sem abrir o Foundry, e mantém as anotações do
personagem pelo portal. O Foundry continua sendo a fonte de verdade da
mecânica.

## Decisões

- **O que aparece:**
  - atributos e características;
  - inventário;
  - magias;
  - talentos;
  - raízes (ancestralidade, profissões e idiomas);
  - aparência e religião.
- **O que se edita:** só as anotações, que são a descrição do personagem
  (`system.description`, o campo que a ficha do sistema mostra). Atributos,
  itens, moedas e magias continuam sendo alterados no Foundry.
- **Quem vê:** só o jogador vinculado. A ficha completa nunca aparece para
  outros jogadores nem em páginas públicas.

## Origem dos dados (módulo 0.11.0+)

A sincronização de personagens passa a levar uma `sheet` por personagem, com
os valores já preparados pelo sistema `demonlord`:

| Grupo | Origem no Foundry |
| --- | --- |
| Atributos | `system.attributes.<atributo>.value` |
| Características | `system.characteristics.defense`, `speed`, `power`, `size`, `fortune` |
| Aparência e religião | `system.appearance.*`, `system.religion.value` |
| Inventário | itens `weapon`, `armor`, `item`, `ammo` e `relic`: quantidade, se está equipado (`wear`), preço, propriedades, dano, empunhadura, defesa e tipo de consumível |
| Magias | itens `spell`: tradição, nível, tipo, atributo, conjurações (`castings`), alvo, área e duração |
| Talentos | itens `talent`, `feature` e `specialaction`, com grupo e usos |
| Raízes | itens `ancestry`, `profession` e `language` |
| Anotações | `system.description` em texto simples e uma marca da versão |

- Descrições viajam como texto simples e truncado, sem trechos secretos nem
  conteúdo de mestre.
- A ficha de um personagem tem até 400 000 caracteres; acima disso, o módulo
  corta as descrições antes de enviar.
- Alterar um item de um personagem dispara uma nova sincronização.
- Com módulo antigo, a ficha não chega, e o portal mantém a última que
  recebeu.

## Interface

- Abaixo do resumo do personagem, a seção "Ficha completa" mostra abas na URL
  (`?ficha=`):
  - Atributos;
  - Inventário (n);
  - Magias (n);
  - Talentos (n);
  - Raízes;
  - Anotações.
- **Inventário:** filtro por tipo (armas, armaduras, itens, munição,
  relíquias); cada item mostra o resumo na linha e a descrição ao abrir;
  "Equipado" para armas e armaduras em uso.
- **Magias:** agrupadas por tradição, ordenadas por nível, com conjurações
  restantes.
- **Talentos:** agrupados pelo grupo do sistema, com usos.
- **Estados:**
  - carregando;
  - erro, com "Tentar novamente";
  - ficha indisponível com módulo antigo (aviso com a versão necessária);
  - listas vazias.

## Anotações

- A aba Anotações mostra o texto atual e permite editar e salvar.
- **Ao salvar:**
  - o portal envia o comando `character.notes.update`;
  - o módulo grava `system.description` em parágrafos escapados e
    sincroniza a ficha de novo.
- **Conflito:** o envio leva a marca da versão que o jogador viu. Se alguém
  editou a descrição no Foundry nesse meio-tempo, o módulo recusa e o portal
  pede para recarregar.
- **Estados:**
  - aguardando o Foundry;
  - aplicado;
  - recusado por conflito;
  - falhou;
  - bloqueado com módulo anterior ao 0.11.0.
