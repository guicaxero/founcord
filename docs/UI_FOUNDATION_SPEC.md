# Fundação visual — especificação de UI/UX

## Estado e escopo

Esta especificação cobre o primeiro corte da reestruturação visual do portal. O
objetivo é corrigir a fundação compartilhada antes de acrescentar Mercador,
ficha de personagem ou criador de criaturas.

Este corte inclui:

- tokens semânticos de cor, tipografia, espaço, controle, borda, raio e sombra;
- primitivas compartilhadas de ação, feedback, campos, cartões, estados vazios
  e diálogos;
- navegação e shell do portal público;
- navegação e shell do painel de gestão;
- legibilidade, foco, áreas de interação e adaptação dos painéis existentes;
- preservação integral de permissões, consultas, mutações e conteúdo real.

Ficam explicitamente fora deste corte:

- novas regras de negócio;
- Mercador, ficha de personagem e criador de criaturas;
- separação de resumos no modelo de dados;
- alteração dos contratos do Discord ou Foundry;
- criação de uma área do jogador sem funcionalidades próprias já disponíveis.

## 1. Contexto

### Portal público

- **Usuários:** visitante e jogador.
- **Objetivo:** compreender a proposta da campanha, localizar missões publicadas,
  ler crônicas e consultar o Código da Ordem.
- **Problema atual:** em larguras menores, a navegação principal desaparece sem
  alternativa. A identidade visual é forte, mas a descoberta das seções fica
  dependente de rolagem e memória.

### Painel de gestão

- **Usuários:** proprietário global, administrador, gestor, mestre, editor e
  moderador conforme as capacidades retornadas pelo backend.
- **Objetivo:** escolher uma campanha, localizar a área de trabalho e concluir
  uma tarefa editorial ou operacional sem perder contexto.
- **Problemas atuais observados:**
  - **Alto:** a navegação horizontal em 375 px é cortada e não oferece visão das
    áreas restantes nem indicação clara de rolagem;
  - **Alto:** `role="tablist"` é usado sem o comportamento de teclado completo de
    tabs, criando uma promessa semântica maior que a implementação;
  - **Alto:** diálogos dependem do posicionamento padrão do navegador e podem
    aparecer junto ao canto superior, sem limite seguro de altura;
  - **Alto:** ações secundárias de 34–42 px e tipografia recorrente entre
    0,55–0,72 rem prejudicam toque, leitura e zoom;
  - **Médio:** excesso de tamanhos tipográficos e cores literais enfraquece a
    consistência e torna contraste difícil de auditar;
  - **Médio:** navegação, cabeçalho, resumo de acesso, formulário e conteúdo
    competem no primeiro viewport estreito;
  - **Médio:** estados vazios de listas nem sempre incluem próximo passo, mesmo
    quando o usuário possui a capacidade necessária.

## 2. Princípios do corte

1. Clareza operacional antecede ornamentação.
2. Pergaminho, fuligem, metal e brasa identificam a Ordem, mas texto funcional
   usa superfícies estáveis e contraste WCAG 2.2 AA.
3. Brasa indica identidade, seleção ou ênfase editorial; não substitui a cor
   neutra de toda interação.
4. Nenhuma ação ou área principal depende somente de `hover`, cor ou rolagem
   horizontal sem indicação.
5. Controles possuem alvo mínimo de 44 × 44 px, salvo texto inline cujo contexto
   forneça alvo equivalente.
6. Texto funcional não fica abaixo de 0,75 rem; labels e corpo operacional usam
   preferencialmente 0,875–1 rem.
7. O frontend apresenta capacidades; o backend continua autorizando toda ação.

## 3. Arquitetura da informação

### Superfícies

- **Portal público:** início, missões, Código da Ordem e crônicas.
- **Área do jogador:** será adicionada quando houver personagem, histórico ou
  compras. Até lá, jogadores permanecem no portal público e nunca recebem uma
  entrada chamada “administração”.
- **Painel de gestão:** sessões, automações, Foundry, missões, publicações,
  pessoas e acessos, histórico e configurações — filtrados por capacidades.

### Hierarquia do painel

1. Identidade da Ordem e campanha ativa.
2. Localização/saída para o portal.
3. Área atual, descrição e escopo de acesso.
4. Conteúdo principal e ação primária da tarefa.
5. Ações secundárias e informações técnicas por progressive disclosure.

Em largura estreita, a área atual deve ser escolhida por um controle rotulado
que mostre todas as opções permitidas. A campanha e a área são decisões
distintas e nunca devem parecer o mesmo seletor.

## 4. Sistema visual

### Papéis de cor

Os valores existentes de tinta e papel podem permanecer como matéria-prima,
mas componentes consomem tokens semânticos:

- `canvas`, `surface`, `surface-muted`, `surface-inverse`;
- `text-primary`, `text-secondary`, `text-muted`, `text-inverse`;
- `border`, `border-strong`;
- `action-primary`, `action-primary-hover`, `action-secondary`;
- `accent`, `focus`, `success`, `warning`, `danger`, `info` e suas superfícies.

Texto secundário pequeno deve usar contraste mínimo de 4,5:1. Estados de
sucesso, alerta e erro combinam cor, texto e, quando útil, ícone ou prefixo.

### Tipografia

- **Display:** títulos editoriais e nomes da Ordem; serifada, com parcimônia.
- **Funcional:** navegação, labels, campos, ajuda, botões e estados; fonte de
  sistema altamente legível.
- Escala funcional: 0,75 / 0,875 / 1 / 1,125 rem.
- Escala editorial: 1,5 / 2 / 3 rem, com `clamp()` somente onde a hierarquia
  realmente se adapta.
- Corpo mantém altura de linha entre 1,5 e 1,7 e largura confortável.

### Espaçamento e composição

- Escala: 4, 8, 12, 16, 24, 32, 48 e 64 px.
- 8–12 px dentro de pares fortemente relacionados; 16–24 px entre grupos;
  32–64 px entre seções.
- Cartões operacionais usam raio e sombra discretos; divisões de conteúdo não
  precisam virar cartões independentes.
- O conteúdo de gestão usa largura máxima que preserve leitura e evita painéis
  vazios excessivamente largos.

### Controles e estados

Todos os controles aplicáveis possuem `default`, `hover`, `focus-visible`,
`active/selected`, `disabled` e `loading`. Campos também possuem erro associado;
mensagens de sucesso ou falha ficam próximas da ação.

Os diálogos:

- são centralizados explicitamente;
- possuem largura fluida, altura máxima e rolagem interna;
- conservam fundo legível e `backdrop` distinto;
- recebem foco ao abrir e devolvem foco ao acionador ao fechar;
- fecham por botão rotulado e tecla Escape quando seguro;
- em largura estreita mantêm ações empilhadas e inteiramente visíveis.

## 5. Fluxos e conteúdo

### Navegação pública

- Desktop: wordmark, links de seção e identidade/sessão no cabeçalho.
- Estreito/intermediário: controle “Abrir navegação” expõe Missões, Código da
  Ordem e Crônicas; login/conta permanece identificável.
- O item da seção atual usa texto/estrutura além de cor.

### Navegação de gestão

- Amplo: navegação vertical com nome principal e descrição curta.
- Intermediário: coluna mais compacta sem remover rótulos essenciais.
- Estreito: seletor “Área do painel” substitui a faixa horizontal; a opção ativa
  e todas as áreas permitidas permanecem disponíveis sem corte.
- A navegação usa semântica de `nav`/lista. Não usa tablist sem implementar o
  padrão completo de tabs.

### Formulários

- Labels persistentes e associados aos campos.
- Ajuda de formato aparece antes do erro.
- Ação principal informa resultado: “Criar rascunho”, “Salvar alterações”,
  “Publicar missão”.
- Durante envio, o botão preserva largura, comunica processamento e bloqueia
  duplicação.
- Erros preservam valores e orientam correção.

### Estados

- **Carregamento:** estrutura preservada e mensagem contextual.
- **Vazio inicial:** explica o conteúdo, motivo e próxima ação permitida.
- **Sem resultado:** diferencia filtro de ausência real.
- **Erro recuperável:** explica o que falhou e oferece nova tentativa.
- **Sem permissão:** explica a superfície adequada sem expor controles.
- **Sucesso:** confirma no contexto e informa consequência assíncrona.
- **Conteúdo longo:** nomes e descrições quebram linha sem cortar ações.

## 6. Responsividade

### Estreita — até 719 px

- Uma coluna; sem rolagem horizontal da página.
- Navegação pública expansível e navegação de gestão por seletor completo.
- Cabeçalho e resumo de acesso reorganizados verticalmente.
- Formulários em uma coluna e ações importantes com largura confortável.
- Diálogos respeitam 16 px das bordas e altura disponível.
- Tabelas ou métricas viram cartões/linhas empilhadas antes de usar rolagem.

### Intermediária — 720 a 1099 px

- Conteúdo principal em uma coluna; blocos auxiliares podem formar duas colunas
  quando houver espaço real.
- Navegação de gestão compacta ou seletor, sem faixa truncada.
- Ação primária continua no primeiro viewport da tarefa.

### Ampla — a partir de 1100 px

- Sidebar persistente e área de trabalho com largura controlada.
- Lista e editor podem coexistir quando ambos preservarem ao menos 320 px.
- Espaço extra melhora leitura; não aumenta indefinidamente campos ou linhas.

## 7. Acessibilidade

- Alvo WCAG 2.2 AA.
- Um `h1` por superfície e níveis semânticos sem saltos arbitrários.
- Skip link para conteúdo principal nas superfícies extensas.
- Foco visível com contraste em fundos claros e escuros.
- Ordem de foco acompanha ordem visual; menus e diálogos não deixam foco preso
  em conteúdo oculto.
- Navegação ativa usa `aria-current`; estados selecionados usam nome e estado
  programático apropriado.
- Labels, ajuda e erros usam `htmlFor`, `aria-describedby` e `aria-invalid`
  quando aplicáveis.
- Mudanças de processamento e resultado usam `role="status"`; falhas relevantes
  usam `role="alert"` sem anúncios duplicados.
- `prefers-reduced-motion` elimina deslocamentos não essenciais.
- Zoom a 200% e nomes longos não removem ações nem causam sobreposição.

## 8. Critérios de aceitação

1. Em 375 px, todas as áreas de gestão permitidas podem ser encontradas e
   ativadas sem rolagem horizontal ou texto cortado.
2. Em 375 px, Missões, Código da Ordem e Crônicas permanecem acessíveis pelo
   cabeçalho público.
3. Nenhum texto funcional renderiza abaixo de 12 px e controles primários ou
   secundários possuem alvo mínimo de 44 px.
4. Um diálogo destrutivo abre centralizado, cabe na viewport em 375 px, permite
   operação por teclado e devolve foco ao acionador.
5. A navegação do painel não anuncia padrão de tabs incompleto; a área ativa é
   identificável visual e programaticamente.
6. A ação principal, descrição da tarefa e campanha ativa são perceptíveis no
   primeiro viewport em larguras estreita, intermediária e ampla.
7. Global `owner` aparece como acesso protegido, separado de papéis de campanha,
   e não oferece remoção por controle local.
8. Estados de carregamento, vazio, erro, sucesso e permissão insuficiente usam
   conteúdo específico e não dependem apenas de cor.
9. A navegação por teclado alcança cabeçalho, navegação, conteúdo e ações em
   ordem previsível, com foco sempre visível.
10. `npm run ci` passa sem alterar contratos, RBAC ou dados existentes.

## 9. Validação obrigatória

- Renderizar portal público e painel em 375 × 812, 768 × 900 e 1440 × 1000.
- Verificar pelo menos estado preenchido e vazio; onde possível, erro e loading.
- Percorrer navegação pública, navegação de gestão e um formulário apenas por
  teclado.
- Abrir e fechar ao menos um diálogo por teclado.
- Verificar ausência de overflow horizontal e corte de conteúdo longo.
- Executar lint, tipos, build Cloudflare e testes.
