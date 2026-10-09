# Revisão de UI/UX — Capa das missões e publicação no Discord

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

- **Usuários:** quem cria e edita missões (capa e duração) e quem publica
  missões (`mission:publish`, publicação no Discord).
- **Objetivo:** missões com capa, como os chamados do Discord, e o tópico no
  fórum registros-das-missões criado pelo portal, com a capa na galeria.
- **Painel:** o formulário ganha "Duração estimada" (opcional, como "1-3
  sessões") e "Capa". Missões publicadas ganham a ação "Publicar no Discord"
  (ou "Ver no Discord" depois). O diálogo tem fórum (registros-das-missões
  escolhido), tags do fórum (até 5, botões com `aria-pressed`), "Grau"
  (texto livre), o texto do tópico já no formato do chamado e editável,
  prévia da capa, "Publicar como" e avatar opcionais.
- **Público:** capa no topo do cartão no quadro e no topo da página da
  missão; duração junto de partida e companhia.
- **Estados:** missão não publicada no portal (aviso e botão desabilitado);
  sem capa (aviso de que o tópico fica sem imagem); erro do Discord; já
  publicada (link "Abrir no Discord"; não publica de novo).

## Validação renderizada

Portal local com o Worker do Discord simulado.

| Verificação | Resultado |
| --- | --- |
| Formulário | "Duração estimada" e "Capa" com prévia da imagem enviada. |
| Fórum | "🎯 \| registros-das-missões" vem escolhido entre os fóruns do servidor. |
| Sem capa | "Sem capa: o tópico fica sem imagem na galeria do fórum. Adicione uma em Editar." |
| Texto | "🎯 título / Grau / Local / Participantes / Data: 08/10/2026 - 19h / Duração estimada / Objetivo / Inscrições no portal". |
| Publicação | O Worker recebeu o fórum, as tags escolhidas, o texto e a capa (PNG de 1200 px); o diálogo passa a "O tópico já está no fórum" com "Abrir no Discord". |
| Quadro a 375 px | Capa com 341 px, duração no cartão, documento com 375 px. |
| Diálogo a 375 px | 336 px, sem rolagem horizontal. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Médio | A linha "Grau" juntava todas as tags escolhidas, inclusive "Investigação". | "Grau" virou um campo próprio; as tags ficam só no tópico. |

## Pendências aceitas

- O portal publica cada missão uma vez; mudanças depois são feitas no
  próprio Discord.
- A miniatura real da galeria do fórum só pode ser conferida no Discord, depois
  do deploy.
