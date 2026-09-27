# ADR 0005 — Front-end escuro, navegação completa e base de componentes

## Estado

Aceito em 23 de setembro de 2026. Substitui a seção de identidade visual
"pergaminho, fuligem e brasa" do padrão de UI/UX anterior.

## Contexto

- **A navegação não cobria o produto.** O menu público tinha cinco itens, três
  deles âncoras de uma página longa. Missões, crônicas e diário não tinham rota
  própria, e o jogador não tinha onde acompanhar seus pedidos fora do catálogo
  do Lojista.
- **O visual não acompanhava o resto do produto.** Eram 6.544 linhas de CSS
  artesanal, sem biblioteca de componentes, quase sem animação e com diálogos e
  menus implementados à mão, o que já custava acessibilidade.
- **Havia termos inventados.** "West Marches" e "Vigília" apareciam em telas,
  documentação, no cookie de sessão, numa marca d'água de CSS e no conteúdo
  semeado por migration, sem corresponder ao sistema.

## Decisão

1. **Tema escuro por padrão.** Os tokens ficam no `@theme` do Tailwind 4, em
   `apps/portal/app/globals.css`, organizados por papel (`canvas`, `surface`,
   `line`, `fg`, `accent`, estados e `focus`). Nenhuma tela declara cor literal.
2. **Base de componentes.** Tailwind 4 para estilo, Radix para as primitivas com
   comportamento (diálogo, menu, abas), Motion para animação e
   `class-variance-authority` para variantes. Todas gratuitas e sem serviço
   externo.
3. **Movimento com propósito.** Variantes compartilhadas, entre 140 ms e 250 ms,
   desligadas por `prefers-reduced-motion`.
4. **Navegação única e consciente de papel**, com uma rota por área do produto e
   a entrada de gestão condicionada a permissão. A área do jogador passa a ser
   `/eu`; `/personagem` continua existindo como redirecionamento, porque o
   comando `/personagem` do Discord aponta para ele.
5. **Migração em três fases**, cada uma um PR implantável: fundação e navegação;
   portal público e área do jogador; painel de gestão. Enquanto as folhas antigas
   existiram, um bloco de compatibilidade remapeou a escala `ink-*`/`paper-*`
   para os tokens escuros, e cada fase removeu as folhas que substituiu. A fase 3
   apagou as últimas folhas e o bloco de compatibilidade.
6. **Terminologia.** "West Marches" e "Vigília" saem do produto. Os cookies
   passam a `ordem_session` e `ordem_oauth`, com leitura dos nomes antigos por
   uma versão para não encerrar sessões, e a migration `0016` limpa o conteúdo
   semeado. O ADR 0004 permanece como registro histórico.

## Consequências

- O bundle do portal cresce de 1,32 MB para cerca de 1,66 MB comprimido, contra
  o limite de 3 MB do plano gratuito.
- Telas novas passam a ser montadas com as primitivas; recriar componente que já
  existe vira desvio de padrão.
- A remoção dos nomes antigos de cookie só pode acontecer depois que a versão
  com leitura dupla estiver em produção por tempo suficiente.
