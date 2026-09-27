# Vínculo entre jogador e ator do Foundry

## Objetivo do incremento

Criar uma associação explícita, auditável e segura entre um membro da campanha no
portal e um ator do tipo `character` sincronizado pelo módulo do Foundry. Este
vínculo será a fonte de identidade para a futura compra no Lojista e para a área
de ficha do jogador.

Este incremento não movimenta moedas, itens ou documentos do Foundry.

## Decisão de domínio

- O vínculo pertence à campanha e ao banco principal do portal.
- IDs de usuários internos do Foundry não representam a identidade do portal.
- Um membro pode ter um personagem ativo por campanha nesta primeira versão.
- Um ator pode estar associado a somente um membro dentro do mundo.
- A projeção sincronizada pode ficar indisponível sem apagar o vínculo. Isso
  preserva histórico e permite recuperação quando o mundo voltar a sincronizar.
- A autorização é validada no backend em todas as leituras e mutações.

## Matriz de acesso

| Papel | Consultar o próprio personagem | Consultar vínculos da campanha | Vincular ou desvincular |
| --- | --- | --- | --- |
| Proprietário global | Sim | Sim | Sim |
| Gestor da campanha | Sim | Sim | Sim |
| Mestre da campanha | Sim | Sim | Sim |
| Jogador | Sim | Não | Não |
| Usuário sem participação ativa | Não | Não | Não |

Administrador global não recebe acesso implícito ao Foundry. Como na conexão de
mundos, ele precisa de um papel autorizado na campanha; o proprietário global é a
única exceção global.

## Especificação de UI/UX

### Usuários e tarefas

- **Gestor ou mestre:** localizar um membro, reconhecer os personagens
  sincronizados e atribuir o ator correto sem copiar IDs técnicos.
- **Jogador:** confirmar qual personagem está ligado à própria conta e consultar
  uma ficha resumida, entendendo quando os dados estão atrasados ou indisponíveis.

### Superfícies

1. **Painel de gestão — Personagens:** superfície exclusiva de gestão, separada
   de “Pessoas e acessos”. Mostra o elenco da campanha e a situação de cada
   vínculo.
2. **Área do jogador — Meu personagem:** superfície autenticada fora do painel
   administrativo. Mostra apenas os vínculos do usuário atual.
3. **Discord — `/personagem`:** resposta efêmera que encaminha o usuário para a
   área autenticada. A ficha não é reproduzida no Discord neste corte.

### Hierarquia do painel de gestão

1. Contexto da campanha e contagem de vínculos.
2. Estado da sincronização e orientação quando não há personagens disponíveis.
3. Lista de membros ativos; cada item mostra identidade, vínculo atual e estado.
4. Ação progressiva “Alterar vínculo” ou “Vincular personagem”.
5. Desvinculação é ação destrutiva secundária e exige confirmação contextual.

A seleção apresenta nomes reconhecíveis e informações auxiliares de nível,
ancestralidade e mundo. IDs técnicos não são exigidos nem exibidos como conteúdo
principal.

### Hierarquia da área do jogador

1. Título “Meu personagem” e explicação do vínculo com a campanha.
2. Cartão principal com nome, nível, ancestralidade, caminhos e condição.
3. Estado da sincronização com data da última atualização.
4. Próximos recursos explicados sem controles falsos de edição ou compra.

### Fluxos

#### Vincular

1. Gestor abre “Personagens” no painel e escolhe “Vincular personagem”.
2. O formulário associado ao membro lista somente atores ativos e ainda livres.
3. Gestor seleciona o ator e aciona “Salvar vínculo”.
4. Durante o envio, o controle impede duplicação e comunica processamento.
5. Após confirmação do servidor, a lista é atualizada e anuncia o sucesso.

#### Alterar

O mesmo formulário mostra o vínculo atual. Selecionar outro ator e salvar troca a
associação de forma atômica. Conflitos informam que outro membro já recebeu o
ator e preservam a seleção para correção.

#### Desvincular

A ação “Desvincular personagem” revela uma confirmação inline com o nome do ator
e as consequências. Cancelar retorna sem mutação. Confirmar remove somente o
vínculo; não remove o ator do Foundry.

### Estados obrigatórios

- Carregamento inicial com estrutura estável.
- Lista preenchida.
- Nenhum personagem sincronizado: explicar como solicitar sincronização no
  módulo e apontar para “Mundos do Foundry”.
- Membro sem vínculo: informar que compras e ficha integrada ainda não estarão
  disponíveis.
- Projeção inativa ou ausente: preservar a associação e marcar “não encontrado na
  última sincronização”.
- Erro recuperável com ação “Tentar novamente”.
- Processamento e sucesso contextual.
- Conflito de ator já utilizado.
- Sem permissão e sessão expirada diferenciados pelo backend.

### Responsividade

- Em largura ampla, resumo e ação ficam em colunas; a lista usa cartões de duas
  colunas quando houver espaço real.
- Em largura intermediária, cada cartão permanece em uma coluna e mantém a ação
  ao lado do estado quando couber.
- Em largura estreita, identidade, estado, seleção e ações passam para fluxo
  vertical; botões ocupam largura confortável e nunca ficam sobrepostos.
- Nome, campanha e estado nunca são ocultados.

### Acessibilidade

- Estrutura com títulos sequenciais, listas semânticas, `label` persistente e
  mensagens ligadas ao respectivo formulário.
- Todos os controles funcionam por teclado e exibem foco perceptível.
- Estado não depende somente de cor; usa texto e símbolo.
- Mensagens de processamento e sucesso usam região de status; erros usam alerta.
- A confirmação inline mantém ordem de foco previsível e retorna à ação de origem
  ao cancelar.

## Contrato técnico de frontend

- TanStack Query mantém cache separado para elenco gerenciável e personagens do
  usuário atual.
- Mutações invalidam somente as chaves da campanha e da conta afetadas.
- A interface nunca deduz autorização por papel; usa capacidades devolvidas pelo
  backend.
- O painel reutiliza shell, navegação, feedback e tokens existentes.
- A área do jogador reutiliza o shell público, mas se identifica como superfície
  autenticada e não administrativa.

## Critérios de aceitação

- Um jogador autenticado vê somente seu próprio personagem e não recebe a lista
  de candidatos nem vínculos de outros membros.
- Jogador e usuário comum recebem `403` ao tentar criar ou remover vínculo.
- Proprietário, gestor e mestre conseguem vincular dentro do escopo autorizado e
  não conseguem agir em outra campanha.
- Um ator não pode ser associado simultaneamente a dois membros.
- Um membro não pode possuir dois vínculos ativos na mesma campanha.
- A troca ou remoção gera registro de auditoria com ator anterior e novo ator.
- Um ator ausente da sincronização aparece como indisponível sem apagar a
  associação.
- As telas funcionam em 375, 768 e 1440 px e permitem concluir os fluxos por
  teclado.
- A implementação não copia código do módulo do Foundry para este repositório.
