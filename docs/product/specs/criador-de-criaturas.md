# Criador de criaturas para mestres

## Objetivo

O mestre monta uma criatura no portal, a partir do bestiário ou do zero, revisa
e envia para o Foundry, onde o módulo cria o ator pronto para a cena. A criatura
fica guardada numa biblioteca da campanha e pode ser editada e reenviada.

## Decisões

- **Ponto de partida:** uma criatura do bestiário importado, ou uma ficha em
  branco com valores sugeridos pela dificuldade. As sugestões usam a mediana do
  bestiário importado para aquela dificuldade.
- **Conteúdo do livro:** o bestiário e o grimório entram **só por importação no
  painel**. O mestre seleciona os JSON de `compendium/Bestiário` e
  `compendium/Grimório`, e nada disso vai para os repositórios. O conteúdo fica
  restrito à área de gestão (`creature:manage`).
- **Resultado:** a criatura fica na biblioteca do portal, e o comando
  `creature.upsert` cria o ator numa pasta "Ordem — Criaturas". Reenviar
  atualiza o mesmo ator em vez de criar outro.
- **Segurança:** nenhuma macro ou código é executado. Descrições viajam como
  texto simples; o módulo as escapa e monta os parágrafos. Imagens só aceitam
  caminhos do Foundry ou HTTPS.

## Modelo da criatura

A criatura segue os campos do sistema Demon Lord, conferidos no compêndio.

| Grupo | Campos |
| --- | --- |
| Identidade | Nome, descritor, descrição, dificuldade (1, 5, 10, 25, 50, 100, 250, 500), tamanho, imagem |
| Atributos | Força, Agilidade, Intelecto, Vontade, Percepção |
| Características | Defesa, Vida, Deslocamento, Poder, Insanidade, Corrupção, sentidos, traços de deslocamento, armadura, amedrontadora, horripilante |
| Itens | Ataque (`weapon`), traço (`talent`), ação especial (`specialaction`), fim da rodada (`endoftheround`), magia (`spell`) |

Um ataque traz modificador (ex.: `+7`), resistência (Defesa ou atributo),
dádivas e dano. Uma magia traz tradição, nível, atributo, tipo, alvo, área e
duração. Efeitos ativos e bônus automáticos do Foundry não são reproduzidos.

## Fluxo no painel (`/dashboard/criaturas`)

- **Biblioteca:**
  - lista as criaturas da campanha com dificuldade, descritor e situação no
    Foundry (rascunho, aguardando o Foundry, no Foundry, falhou);
  - ações: editar, duplicar, enviar e excluir;
  - "Nova criatura" oferece duas saídas: do zero ou a partir do bestiário.
- **Compêndio:**
  - importa os JSON do bestiário e do grimório;
  - mostra o que já foi importado, com busca e filtro por dificuldade ou
    tradição;
  - "Usar como base" cria uma cópia editável na biblioteca.
- **Editor (`?criatura=<id>`):**
  - seções de identidade, atributos, características, descrição e itens;
  - os itens são adicionados por tipo, e as magias podem vir do grimório;
  - "Salvar" grava a criatura;
  - "Enviar ao Foundry" confirma o destino e envia a versão salva.

## Estados

- **Compêndio vazio:** mostra "Importar bestiário".
- **Envio bloqueado:** módulo anterior ao 0.10.0 ou nenhum mundo conectado.
- **Conflito de versão:** outra aba salvou antes; é preciso recarregar.
- **Falha do Foundry:** a mensagem do módulo aparece no cartão da criatura.
