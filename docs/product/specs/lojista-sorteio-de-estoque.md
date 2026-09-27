# Lojista — sorteio de estoque do Lojista

## Objetivo

Montar o estoque do Lojista sorteando itens de uma lista mantida no portal, em
vez de cadastrá-los à mão no Foundry. O protótipo foi a planilha
"Estoque Lojista" (137 itens em 10 categorias), com os filtros de
disponibilidade máxima, categoria, quantidade e repetição.

## Decisões

- **O Foundry continua sendo a fonte de verdade.** O portal sorteia, mas o
  estoque só existe quando o módulo cria os itens no ator do Lojista. A
  vitrine, os ícones e os pedidos seguem o fluxo que já existia.
- **Um Lojista por campanha:** o ator escolhido como Lojista na tela de
  conexão do módulo.
- **Sorteio uniforme**, como na planilha. A disponibilidade máxima só define o
  teto:
  - Comum: só comuns;
  - Incomum: comuns e incomuns;
  - Raro: até raros;
  - Exótico: todas.
- **Quantidade:**
  - sem repetição, cada item sai no máximo uma vez, com 1 unidade;
  - com repetição, um item sorteado de novo soma quantidade.
- Itens **sem preço** ou **desativados** ficam fora do sorteio.

## Fluxo

```text
Painel › Estoque do Lojista
  Catálogo  → lista base (planilha) + cadastro e edição
  Sorteio   → critérios → prévia no backend → "Enviar ao Foundry"
  Histórico → sorteios anteriores e seus itens
        ↓ comando merchant.stock.replace (fila do Foundry Bridge, 7 dias)
        ↓ módulo 0.8.0: troca os itens sorteados antes, preserva os manuais
        ↓ sincronização normal do Lojista → /lojista
        ↓ resultado do comando → portal marca o sorteio como aplicado ou falho
```

- **Prévia:** fica no banco do portal (`merchant_stock_draws`). "Sortear de
  novo" descarta a prévia anterior.
- **Envio:** passa pela fila de comandos, como os pedidos. Com o mestre fora do
  mundo, o comando espera na fila; o portal mostra "Aguardando o Foundry".
- **Bloqueios de envio**, cada um explicado na tela:
  - mundo com módulo anterior ao 0.8.0;
  - mundo sem ator de Lojista configurado;
  - mundo desconectado.

## Dados

- `merchant_catalog_items`, um por campanha.
  - **Campos:** nome, categoria, tipo no Foundry (`weapon`, `armor`, `item`),
    disponibilidade, preço (texto do livro), dano, empunhadura, bônus de
    Agilidade, defesa fixa, requisito, propriedades, descrição, ícone,
    `source`, `active` e `version`.
  - **Unicidade:** nome e categoria são únicos por campanha. A importação da
    lista base não duplica itens.
  - **Origem:** `source` vale `lojista` hoje. Os NPCs artesãos (arcanista,
    ocultista, druida, alquimista) entram depois com a própria origem, no mesmo
    catálogo e distribuídos pelo Lojista.
- `merchant_stock_draws`: critérios, cópia dos itens sorteados, situação
  (`preview`, `pending_delivery`, `applied`, `failed`, `discarded`), mundo de
  destino, comando e erro.
- **Permissão:** `merchant:catalog:manage`, para owner, administrator,
  campaign_manager e gm.

## Lista base

Gerada a partir da planilha, com as correções:

1. **"Desarmado":** saiu, porque não tem preço nem disponibilidade.
2. **"Espada bastarda ou martelo de guerra":** aparecia duas vezes; virou as
   variantes "(uma mão)" e "(duas mãos)".
3. **"Joias":** estava como "Raro ou Exótico" e ficou Raro.
4. **"Vestimenta":** tem preço variável; entra sem preço e fica fora do sorteio.
5. **Requisitos no nome** ("requer Força 9+"): foram para o campo de requisito.
6. **Preços com "+"** (`1 xp+`): passam a ser exibidos como "a partir de".

Armas, armaduras e escudos usam os ícones do próprio sistema Demon Lord.

## Fora deste corte

- NPCs artesãos e filtro por origem.
- Pergaminhos do arcanista, com a magia sorteada do JSON de magias.
- Importar `.xlsx` pelo painel.
- Peso por raridade.
- Vários lojistas.
