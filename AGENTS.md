# Instruções permanentes do projeto

## Frontend e experiência do usuário

Antes de criar, alterar ou revisar qualquer tela, componente visual, fluxo de navegação, formulário ou texto de interface, leia integralmente [`PADRAO_DE_UI_UX.md`](./PADRAO_DE_UI_UX.md).

Esse documento é a fonte de verdade para decisões de UI/UX do projeto. Nenhuma alteração de frontend deve ser considerada concluída sem revisar hierarquia, clareza, acessibilidade, responsividade, estados, feedback e consistência conforme o padrão.

## Regras de produto

- Preserve a separação entre portal público, área do jogador e painel de gestão.
- A autorização deve continuar sendo validada no backend; ocultar controles no frontend não substitui RBAC.
- Papéis globais e papéis de campanha devem ser apresentados separadamente.
- O papel global de proprietário nunca deve parecer removível por um controle de campanha.
- Use conteúdo real da Ordem da Última Luz; não invente ambientação quando houver conteúdo oficial no repositório.

## Fluxo Git

- Toda mudança deve chegar à `main` por Pull Request.
- Depois de confirmar o merge de um Pull Request, exclua a branch correspondente no remoto e localmente.
- Antes de excluir uma branch integrada por squash, confirme que seu conteúdo está integralmente representado na `main`.
