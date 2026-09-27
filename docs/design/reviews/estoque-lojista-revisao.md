# Revisão de UI/UX — Estoque do Lojista

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md) e a
[especificação do sorteio](../../product/specs/lojista-sorteio-de-estoque.md).

## Especificação

- **Usuário:** mestre ou gestor da campanha (`merchant:catalog:manage`).
- **Objetivo:** montar o estoque do Lojista sem cadastrar item por item no
  Foundry.
- **Área:** `/dashboard/estoque`, no grupo "Foundry e Lojista", com três abas
  na URL (`?aba=`):
  - **Sorteio.**
    - Critérios: teto de disponibilidade em chips com a explicação logo abaixo;
      categorias em chips de seleção múltipla, com a contagem de itens que cabem
      no teto; quantidade; repetição.
    - Contagem ao vivo dos itens elegíveis, com o aviso quando, sem repetição,
      o estoque sai menor que o pedido.
    - Prévia em `DataTable` e "Enviar ao Foundry" com `ConfirmDialog`, que
      explica que os itens manuais são preservados e que o envio espera o mestre
      entrar no mundo.
  - **Catálogo.** Busca, filtros de disponibilidade e categoria, "Mostrar
    desativados", edição em diálogo com campos que mudam conforme o tipo
    (arma ou armadura) e "Importar lista base".
  - **Histórico.** Sorteios com critérios, situação e os itens em diálogo.
- **Estados:** catálogo vazio (com as ações de importar e cadastrar), carregando,
  erro com "Tentar novamente", nenhum item elegível, sem prévia, aguardando o
  Foundry, aplicado, falhou e envio bloqueado (módulo antigo, Lojista não
  configurado, mundo desconectado ou sem mundo).

## Validação renderizada

Ambiente local com D1 migrado e sessão `owner`. O bridge do Foundry não está
configurado localmente.

| Verificação | Resultado |
| --- | --- |
| Catálogo vazio | Estado com "Importar lista base (137 itens)" e "Cadastrar item". |
| Importação | 137 itens importados, com toast; a aba passa a "Catálogo (137)". |
| Critérios | "Até Incomum" + "Armas à Distância" anuncia "5 itens atendem" e avisa o limite sem repetição. |
| Sorteio | Prévia com Arco, Besta, Funda, Arco longo (Força 9+) e Zarabatana, preços por extenso. |
| Envio sem bridge | Aviso "Não foi possível consultar os mundos agora" e "Enviar ao Foundry" desabilitado. |
| 375 px | Sem rolagem horizontal; as três abas dividem a largura. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Médio | O resumo do catálogo dizia "137 ativos entram no sorteio", mas a Vestimenta não tem preço. | Passa a contar só itens com preço e mostra quantos ficam de fora. |
| Baixo | Aspas retas no texto do estado vazio. | Aspas tipográficas. |

## Pendências aceitas

- O envio real ao Foundry só pode ser validado com o módulo 0.8.0 num mundo
  conectado. Até lá, a cobertura vem dos testes de API (estado e retorno do
  bridge) e dos testes do módulo.
