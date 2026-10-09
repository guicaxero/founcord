# Revisão de UI/UX — Estoque atual do Lojista

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

- **Usuário:** Guardião com `merchant:catalog:manage`.
- **Problema:** enviar uma seleção trocava tudo o que o portal tinha enviado;
  "Carregar o estoque atual" lia só o último envio, não o ator; itens
  colocados à mão no Foundry não tinham a quantidade editável (a ficha de
  arma não mostra quantidade).
- **Objetivo:** ver o estoque real do Lojista e mudar só o que for preciso.
- **Hierarquia:** aba "Estoque atual" (padrão) → catálogo à esquerda, "No
  Lojista" à direita com quantidade, origem ("Do portal" ou "Colocado à
  mão"), "Remover"/"Manter" e itens novos ("Novo", "Tirar"); rodapé com o
  número de mudanças, "Descartar mudanças" e "Salvar no Foundry" (ação
  principal).
- **Estados:** consultando mundos; nenhum mundo; Lojista não escolhido;
  módulo anterior à 0.13.0 (aviso, salvar desabilitado); módulo ainda não
  sincronizou; Lojista vazio; erro de leitura; envio na fila; aplicado;
  aplicado em parte (lista dos itens com conflito ou ausentes); falhou.
- **Critérios:** só as mudanças são enviadas; item do catálogo que já está no
  Lojista aparece como "No Lojista" (edita-se a quantidade na linha dele);
  conflito de quantidade não sobrescreve o Foundry e é explicado por item.
- "Seleção" passou a se chamar "Trocar o estoque", com o texto dizendo que
  troca tudo o que o portal enviou; "Carregar o estoque atual" virou
  "Carregar o último envio", que é o que ele faz.

## Validação renderizada

Portal local com D1 migrado e um bridge simulado que responde aos endpoints
internos e aplica o `merchant.stock.patch` como o módulo 0.13.0.

| Verificação | Resultado |
| --- | --- |
| Leitura | "Lojista · 4 itens · lido em …", com duas "Espada curta" (cópias de antes da 0.13.0), "Escudo pequeno" do portal e "Pão" à mão. |
| Catálogo | Busca "esc": "Escudo pequeno" aparece como "No Lojista"; os demais com "Adicionar". |
| Edição | Quantidade mostra "Era 1"/"Era 2"; "Remover" marca "Será removido" e troca para "Manter"; item novo com "Novo" e "Tirar"; rodapé "4 mudanças". |
| Confirmação | "2 quantidades · 1 item removido · 1 item novo" e o texto sobre só as mudanças irem ao Foundry. |
| Erro do servidor | Sem a migração local, o diálogo mostrou o erro sem perder as mudanças. |
| Conflito | Uma compra simulada entre a leitura e a aplicação: "Algumas mudanças não foram aplicadas — Espada curta: a quantidade mudou no Foundry depois da leitura…". |
| Depois de aplicar | A lista relida mostra Escudo pequeno 5, Escudo grande novo "Do portal", Pão removido e a espada com a quantidade do Foundry. |
| 375 px | Sem rolagem horizontal (documento com 375 px). |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Baixo | Título "O que Lojista tem agora" quando o ator se chama "Lojista". | Título fixo "O que o Lojista tem agora"; o nome do ator vai na linha de leitura. |

## Pendências aceitas

- Botões `size="sm"` têm 36 px de altura, como no restante do painel do
  Lojista; segue o padrão já existente da área.
- A aplicação real depende do módulo 0.13.0 num mundo conectado.
