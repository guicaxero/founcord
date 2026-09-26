# Instruções permanentes do projeto

## Frontend e experiência do usuário

Antes de criar, alterar ou revisar qualquer tela, componente visual, fluxo de navegação, formulário ou texto de interface, leia integralmente:

1. [`docs/design/padrao-de-ui-ux.md`](./docs/design/padrao-de-ui-ux.md);
2. [`.agents/AGENTE_ESPECIALISTA_UI_UX.md`](./.agents/AGENTE_ESPECIALISTA_UI_UX.md);
3. [`.agents/AGENTE_ESPECIALISTA_FRONTEND.md`](./.agents/AGENTE_ESPECIALISTA_FRONTEND.md).

`docs/design/padrao-de-ui-ux.md` continua sendo a fonte de verdade para decisões visuais e de experiência do produto; os perfis em `.agents/` definem como especificar, implementar e revisar essas decisões. Nenhuma alteração de frontend deve ser considerada concluída sem revisar hierarquia, clareza, acessibilidade, responsividade, estados, feedback e consistência conforme o padrão.

### Pipeline obrigatório de interface

Toda mudança que altere experiência, apresentação ou comportamento de interface deve passar pelas fases abaixo, nesta ordem:

1. **Especificação de UI/UX:** o especialista de UI/UX define usuário, objetivo, hierarquia, fluxo, conteúdo, estados, responsividade, acessibilidade e critérios de aceitação antes da implementação.
2. **Contrato e implementação Front-end:** o especialista de Front-end inspeciona o produto existente, registra o contrato técnico aplicável, implementa e valida comportamento, tipos, acessibilidade e responsividade.
3. **Validação renderizada:** o resultado deve ser executado e inspecionado em larguras estreita, intermediária e ampla, incluindo estados relevantes e operação por teclado.
4. **Revisão final de UI/UX:** o especialista de UI/UX compara a experiência renderizada com a especificação e classifica achados por impacto.
5. **Correção e conclusão:** achados críticos e altos bloqueiam a conclusão; achados médios ou baixos precisam ser corrigidos ou registrados explicitamente como pendência aceita.

Quando execução com agentes especializados estiver disponível, use agentes separados para UI/UX e Front-end conforme os perfis em `.agents/`. Quando não estiver, o agente principal deve executar e registrar distintamente todas as fases; a indisponibilidade de delegação não permite omitir nenhuma delas.

Mudanças exclusivamente de backend, infraestrutura, banco, contratos sem interface ou documentação técnica não exigem esse pipeline. Se uma mudança de backend afetar mensagens, estados, permissões ou comportamento percebido na interface, o pipeline volta a ser obrigatório.

### Hierarquia das instruções

- Este `AGENTS.md` define escopo, produto e processo obrigatório.
- `docs/design/padrao-de-ui-ux.md` define o padrão visual e de experiência da Ordem da Última Luz.
- Os perfis em `.agents/` definem responsabilidades, entregáveis e critérios de revisão dos especialistas.
- Em caso de conflito, preserve as regras de produto e o padrão do repositório e registre a decisão; nenhum especialista deve alterar silenciosamente a intenção relevante do outro.

## Regras de produto

- Preserve a separação entre portal público, área do jogador e painel de gestão.
- A autorização deve continuar sendo validada no backend; ocultar controles no frontend não substitui RBAC.
- Papéis globais e papéis de campanha devem ser apresentados separadamente.
- O papel global de proprietário nunca deve parecer removível por um controle de campanha.
- Use conteúdo real da Ordem da Última Luz; não invente ambientação quando houver conteúdo oficial no repositório.

## Fonte de referência do jogo

- A pasta `compendium/`, na raiz `FMS` ao lado dos dois repositórios, guarda os exports em português do Shadow of the Demon Lord no Foundry: Bestiário, Grimório, Equipamentos, Ancestralidades, Trilhas, Talentos, Profissões, Idiomas, Peculiaridades de Insanidade, Tabelas, Regras e Lore e Veículos. Cada pasta tem um `_manifesto.json`.
- Consulte essa pasta antes de decidir qualquer regra, nome, valor ou formato de dado do jogo; não invente números nem nomes quando o compêndio os tiver.
- É conteúdo dos livros: não copie seus arquivos para repositório nenhum. O portal só recebe esse conteúdo por importação feita pelo mestre no painel, e ele fica restrito a superfícies de gestão, nunca a páginas públicas. O repositório do módulo é público e não pode conter nada do compêndio.

## Limites entre repositórios

- O código, o manifesto e as releases do módulo cliente do Foundry residem exclusivamente em `guicaxero/founcord-module-foundryVTT`.
- Este monorepo mantém o portal, os Workers, os contratos compartilhados e a documentação da integração, mas não deve receber uma cópia do código do módulo.
- Alterações que precisem dos dois lados devem usar PRs independentes e contratos versionados, sem duplicar arquivos entre os repositórios.

## Fluxo Git

- Toda mudança deve chegar à `main` por Pull Request.
- Depois de confirmar o merge de um Pull Request, exclua a branch correspondente no remoto e localmente.
- Antes de excluir uma branch integrada por squash, confirme que seu conteúdo está integralmente representado na `main`.
