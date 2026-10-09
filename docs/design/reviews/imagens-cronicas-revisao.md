# Revisão de UI/UX — Imagens nas crônicas

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

- **Usuários:** quem escreve crônicas no painel (`post:create`) e o público
  que lê o arquivo.
- **Objetivo:** dar capa e imagens às crônicas, como as que o mestre já posta
  no Discord, e mostrar o texto com a formatação do Discord.
- **Painel:** o formulário da crônica ganha "Capa" (uma imagem) e "Imagens"
  (até 8, na ordem de envio), ambos opcionais, com prévia, "Trocar a capa",
  "Adicionar imagens", "Remover" em cada imagem, progresso ("Enviando 1 de
  2…") e erro em `role=alert`. Salvar fica bloqueado durante o envio.
- **Público:** capa no topo do cartão do arquivo e no topo da crônica;
  imagens depois do texto, cada uma abrindo em tamanho original; o texto
  mostra citações, negrito, itálico, sublinhado e riscado, sem HTML cru.
- **Regras:** WebP, PNG, JPEG ou GIF até 8 MB, conferidos pelos primeiros
  bytes no servidor; a imagem precisa ser da mesma campanha.

## Validação renderizada

Portal local com D1 migrado e R2 local do Wrangler.

| Verificação | Resultado |
| --- | --- |
| Envio da capa | Prévia "Capa escolhida" servida por `/media/<id>`; o botão passa a "Trocar a capa". |
| Galeria | Duas imagens enviadas de uma vez: "Enviando 1 de 2…", depois "2 de 8 · …". |
| Diálogo a 375 px | 336 px de largura, sem rolagem horizontal. |
| Crônica publicada | Capa no topo, citação "Escrito por **…**" como bloco, itálico, riscado, sublinhado e `\*eco\*` mostrado como `*eco*`. |
| 375 px | Documento com 375 px; imagens com 343 px. |
| Arquivo a 1440 px | Capa ocupa o topo do cartão, borda a borda. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Médio | O resumo do cartão mostrava "Escrito por Guardião da Chama" (a citação) em vez do texto. | O resumo ignora citações. |
| Baixo | Caracteres escapados apareciam com barra no resumo. | O resumo trata os escapes como o texto completo. |

## Pendências aceitas

- As imagens são públicas para quem tiver o link, inclusive as de rascunho
  (ids aleatórios, sem listagem). Excluir uma crônica não apaga as imagens do
  bucket.
- A ordem da galeria é a de envio; para mudar, remova e envie de novo.
