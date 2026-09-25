# PADRÃO DE UI/UX

Fonte de verdade para todo trabalho de frontend do portal. Deve ser lido
integralmente antes de criar, alterar ou revisar telas, componentes, navegação,
formulários e textos de interface.

## Objetivo

Interfaces com qualidade de produto digital profissional: claras, consistentes,
acessíveis e com hierarquia evidente. Cada decisão precisa de uma justificativa
de experiência, hierarquia de informação ou comportamento esperado.

## 1. Prioridades, nesta ordem

1. Clareza. 2. Usabilidade. 3. Hierarquia visual. 4. Consistência.
5. Feedback. 6. Acessibilidade. 7. Eficiência. 8. Estética.

A interface deve ser compreensível sem tentativa e erro. Remova complexidade
visual ou funcional que não agregue valor.

## 2. Sistema visual

O tema é **escuro por padrão**. Os tokens vivem em `apps/portal/app/globals.css`,
dentro do `@theme` do Tailwind, e são a única origem de cor, raio, sombra e
tipografia. Nenhuma tela declara cor literal.

| Papel | Token | Uso |
| --- | --- | --- |
| Fundo da página | `canvas` | Plano de fundo geral. |
| Superfície | `surface`, `surface-2`, `surface-3` | Cartões, camadas e estado de hover. |
| Superfície rebaixada | `surface-sunken` | Rodapé e áreas de apoio. |
| Linhas | `line-soft`, `line`, `line-strong` | Separação por ênfase crescente. |
| Texto | `fg`, `fg-muted`, `fg-subtle` | Primário, secundário e de apoio. |
| Acento | `accent`, `accent-strong`, `accent-line`, `accent-soft` | Brasa da campanha: destaque, nunca a cor padrão de tudo que é clicável. |
| Estado | `success`, `warning`, `danger`, `info` e seus `-soft` | Situação, sempre acompanhada de texto. |
| Foco | `focus` | Contorno de foco com 2 px e deslocamento. |

Regras:

- Profundidade vem de camada e borda, não de sombra pesada.
- O acento marca no máximo uma ação por bloco.
- Ouro, cobre e prata existem apenas para representar as moedas do sistema.
- A atmosfera da campanha aparece na tipografia editorial dos títulos
  (`font-display`) e no acento; o texto funcional usa a fonte de leitura.

## 3. Componentes

As primitivas em `apps/portal/components/ui/` são obrigatórias: `button`,
`surface` (cartão, selo, cabeçalho de página, esqueleto), `dialog`, `menu`,
`tabs`, `feedback-state`, `field` (campo, entrada, seleção, texto longo, caixa de
seleção), `notice`, `filter-chips`, `data-table`, `confirm-dialog` e `toast`.
Diálogos, menus, abas e notificações usam Radix, que já entrega foco preso,
retorno de foco, `Esc`, rolagem travada e semântica correta. Não existe mais CSS
fora de `globals.css`: todo estilo vem dos tokens e das utilidades do Tailwind.

- Não recrie um componente existente nem crie variante visual sem necessidade
  funcional.
- Toda área interativa tem no mínimo 44 px de altura.
- Ícone sozinho exige nome acessível.

### Formulários, confirmações e retorno

- Formulários de criação e edição abrem em diálogo, com foco no primeiro campo e
  retorno do foco ao botão que os abriu.
- Ação destrutiva ou que interrompe algo em andamento passa por `ConfirmDialog`,
  com o foco inicial na ação segura. Exclusão permanente exige digitar
  `EXCLUIR`.
- O resultado de uma ação concluída vai para o `toast`. Erro de formulário fica
  junto do formulário, em `Notice`, e recebe o foco.
- Listas de gestão usam `DataTable`: cabeçalhos ordenáveis por teclado com
  `aria-sort` em telas largas e cartões abaixo de 768 px, sem rolagem
  horizontal.

## 4. Movimento

As variantes compartilhadas ficam em `components/ui/motion.tsx`.

- Durações entre 140 ms e 250 ms, com curva de saída suave.
- A animação mostra causalidade: entrada de conteúdo, mudança de estado,
  abertura de camada. Nada decorativo, nada em laço.
- Listas entram em cascata curta, com no máximo ~45 ms entre itens.
- Nunca anime o layout da página inteira nem atrase uma ação.
- `prefers-reduced-motion` zera tudo, pelo `MotionProvider` e pelo reset global.

## 5. Hierarquia, layout e tipografia

- Uma tarefa principal evidente por tela, no primeiro viewport.
- Largura de leitura controlada: texto corrido em torno de 68 caracteres.
- Escala tipográfica pequena e consistente; peso e tamanho têm função.
- Conteúdo dinâmico não pode quebrar o layout: nomes longos, números grandes e
  traduções precisam caber.

## 6. Estados

Projete explicitamente: inicial, carregando, conteúdo, vazio, sem resultado para
filtro, dados parciais, erro recuperável, indisponível, sucesso, processando,
desabilitado, selecionado e permissão insuficiente.

- Carregamento usa esqueleto com a forma do conteúdo, não indicador solto.
- Estado vazio explica o que aparece ali, por que está vazio e qual é o próximo
  passo.
- Erro explica o que houve, por quê e como corrigir, preservando o que a pessoa
  já preencheu.

## 7. Acessibilidade

Conformidade com WCAG 2.2 AA.

- Estrutura semântica, rótulos associados e ordem de foco igual à ordem visual.
- Foco sempre visível e operação completa por teclado.
- Nenhuma informação apenas por cor.
- Mudanças relevantes anunciadas por região viva, sem excesso.
- Texto funcional com no mínimo 12 px.

## 8. Navegação e arquitetura de informação

Superfícies separadas:

- **Portal público:** início, missões, crônicas, diário, Mercador e o Código.
- **Área do jogador (`/eu`):** personagem, inscrições e pedidos.
- **Painel de gestão (`/dashboard/[area]`):** uma URL por área (sessões,
  diário, automações, missões, publicações, Foundry, personagens, pedidos,
  pessoas, histórico e configurações). Barra lateral em telas largas e seletor
  compacto abaixo de 1024 px. As áreas e suas permissões vivem em
  `components/admin/areas.ts`, que também decide quando o menu mostra "Gestão".

Regras:

- A navegação é única e consciente de papel: a entrada de gestão só aparece para
  quem tem ao menos uma permissão de gestão.
- Toda funcionalidade do produto é alcançável pela navegação, sem depender de
  âncora dentro de uma página longa.
- A rota atual é marcada com `aria-current="page"`, incluindo rotas filhas.
- Ocultar controle no frontend nunca substitui RBAC no backend.

## 9. Papéis e permissões

- Papéis globais e de campanha aparecem em grupos separados.
- `owner` é papel global protegido e nunca aparece como item removível.
- Papéis são cumulativos, não modos alternáveis.

## 10. UX writing

- Texto claro, curto e orientado à ação: "Enviar pedido ao mestre", não "OK".
- Use os termos reais do produto e da campanha. "West Marches" e "Vigília" não
  fazem parte do sistema e não devem voltar.
- Nada de jargão técnico ou nome de tabela na interface.

## 11. Checklist de conclusão

- [ ] A tarefa principal está evidente no primeiro viewport.
- [ ] A navegação informa localização e caminho de volta.
- [ ] Ações de gestão estão ocultas para quem não tem permissão.
- [ ] Carregando, vazio, erro, sucesso e desabilitado foram tratados.
- [ ] Foco visível e operação por teclado, inclusive em diálogos e menus.
- [ ] Contraste e alvos de 44 px conferidos.
- [ ] Funciona em 375, 768 e 1440 px, sem rolagem horizontal.
- [ ] O movimento respeita `prefers-reduced-motion`.
- [ ] A interface não depende apenas de cor.
- [ ] A autorização continua validada no backend.

## Regra final

Cada elemento resolve um problema, comunica informação, facilita uma ação, apoia
uma decisão ou dá feedback. Se não faz nada disso, remova.
