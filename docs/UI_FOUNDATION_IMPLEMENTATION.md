# Fundação visual — contrato de implementação Front-end

## Objetivo técnico

Traduzir a especificação de UI/UX em uma base reutilizável sem trocar Next.js,
React, TanStack Query, Tailwind ou a arquitetura atual. Contratos HTTP, query
keys, mutações, permissões e conteúdo permanecem inalterados.

## Mudanças deste corte

### Tokens e primitivas CSS

- `app/styles/base.css` passa a expor tokens semânticos sobre a paleta temática
  existente.
- A escala funcional mínima é centralizada em tokens de tipografia e controles.
- Ações, mensagens, campos, estados vazios, foco e skip link compartilham os
  mesmos estados e métricas.
- Valores antigos continuam disponíveis durante a migração para não quebrar os
  painéis ainda não convertidos.

### Navegação pública

- Criar `components/responsive-navigation.tsx`, um componente tipado e sem
  estado remoto para navegação ampla e menu nativo expansível em espaço menor.
- Usá-lo no portal e no Código da Ordem.
- Adicionar skip link e alvos `main-content` nas superfícies principais.

### Shell de gestão

- Remover semântica incompleta de tabs da navegação principal.
- Desktop usa `nav` com `aria-current="page"`.
- Até 900 px, um `select` rotulado “Área do painel” apresenta todas as áreas
  permitidas e substitui a faixa horizontal cortada.
- O painel ativo é uma `section` nomeada pelo `h1` da área.
- Preservar a filtragem atual de abas por capacidades do backend.

### Controles compartilhados

- Aumentar alvos interativos para pelo menos 44 px.
- Subir texto funcional recorrente para pelo menos 0,75 rem, preferindo
  0,875 rem em labels, botões, navegação e ajuda.
- Centralizar explicitamente diálogos nativos e limitar altura/rolagem.
- Manter ações destrutivas visualmente distintas e próximas do objeto afetado.

### Estados públicos

- Missões e crônicas distinguem carregamento, erro e vazio.
- Erros usam `role="alert"`; resultados assíncronos usam `role="status"` ou
  regiões vivas sem anunciar toda a lista novamente.
- Estado vazio informa o que aparecerá e a próxima ação disponível.

### Prévia de desenvolvimento

- `app/dev/ui-foundation` renderiza o mesmo `DashboardClient` com contratos
  tipados e conteúdo oficial apenas em `NODE_ENV=development`.
- A rota chama `notFound()` fora do desenvolvimento e não concede sessão,
  cookie, token ou autorização de backend.
- A prévia existe somente para validar o shell autenticado nos breakpoints sem
  criar um bypass de OAuth ou alterar o comportamento da rota `/dashboard`.

## Estrutura semântica

```text
body
├── skip link
└── main#main-content
    ├── header / nav
    ├── heading h1
    └── sections nomeadas por h2
```

No painel:

```text
main#main-content.admin-shell
├── aside
│   ├── campanha ativa
│   ├── nav desktop
│   └── seletor de área móvel
└── section.admin-main
    ├── header / breadcrumb
    ├── header da área com h1#admin-page-title
    └── section[aria-labelledby=admin-page-title]
```

## Regras de responsividade

- `<= 719 px`: uma coluna, navegações alternativas completas, formulários de
  uma coluna, ações empilháveis e margem mínima de 16 px.
- `720–1099 px`: composição compacta; nenhum carrossel de navegação.
- `>= 1100 px`: sidebar persistente e listas/editores em colunas apenas quando
  cada lado mantiver largura útil.

## Regras de acessibilidade

- Sem controles apenas por ícone quando o significado não for universal.
- `:focus-visible` não é removido e muda adequadamente em superfícies escuras.
- `aria-current` identifica navegação ativa.
- Labels de campos são programaticamente associados quando o componente for
  tocado neste corte.
- Diálogos usam o elemento nativo, `aria-labelledby` e retorno de foco provido
  pelo fluxo existente; CSS não desloca o diálogo para fora da viewport.
- Movimento respeita `prefers-reduced-motion`.

## Compatibilidade e riscos

- Os seletores CSS existentes são preservados; a migração usa tokens semânticos
  e alterações pontuais para reduzir risco em painéis extensos.
- O menu público usa `details/summary`, evitando biblioteca ou estado global.
- Nenhuma capability é inferida; apenas a lista que decide exibir o acesso ao
  painel será atualizada para incluir todas as capacidades de gestão já
  existentes.
- Testes de HTML devem ser ampliados para skip link, navegação alternativa e
  semântica do shell.

## Definition of Done técnica

1. TypeScript e ESLint passam sem `any` novo.
2. Builds OpenNext e dry-runs dos quatro Workers passam.
3. Testes verificam a nova semântica estrutural.
4. Portal e painel são inspecionados em 375, 768 e 1440 px.
5. Não há overflow horizontal na navegação em 375 px.
6. Navegação por Tab exibe foco e alcança ações na ordem visual.
7. Nenhuma regra de autorização ou mutação muda neste corte.
