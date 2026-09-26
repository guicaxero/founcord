# Revisão de UI/UX — Criador de criaturas

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md) e a
[especificação](../../product/specs/criador-de-criaturas.md).

## Especificação

- **Usuário:** mestre ou gestor da campanha (`creature:manage`).
- **Objetivo:** montar uma criatura a partir do bestiário ou do zero e enviá-la
  ao Foundry sem preencher a ficha do ator campo a campo.
- **Área:** `/dashboard/criaturas`, no grupo "Mesa de jogo".
  - **Abas na URL (`?aba=`):**
    - **Biblioteca:** resumo, busca e tabela com dificuldade, Defesa e Vida,
      situação no Foundry e as ações Editar, Duplicar e Excluir.
    - **Compêndio:** importação por arquivos ou pasta, com progresso e
      resumo; alternância Bestiário | Grimório; busca e filtro por
      dificuldade ou tradição; "Usar como base".
  - **Editor (`?criatura=<id>`):**
    - seções Identidade, Atributos, Características, Descrição e Itens;
    - itens agrupados por tipo, recolhíveis, com resumo na linha;
    - magias vêm do grimório em diálogo com busca;
    - barra fixa com "Salvar" e "Enviar ao Foundry".
- **Estados:**
  - biblioteca vazia, com "Criar do zero" e "Escolher do bestiário";
  - compêndio vazio, com "Importar bestiário" ou "Importar grimório";
  - carregando, com esqueletos e texto para leitores de tela;
  - erro, com "Tentar novamente";
  - criatura não encontrada;
  - alterações não salvas, com aviso ao sair da página e confirmação no
    "Voltar";
  - conflito de versão, com "Carregar a versão atual";
  - envio bloqueado: sem mundo, módulo anterior ao 0.10.0 ou mundo
    desconectado;
  - aguardando o Foundry, no Foundry, ou falhou com a mensagem do módulo.

## Validação renderizada

Ambiente local com D1 migrado, sessão `owner` e o compêndio importado pela API
de importação (147 criaturas e 417 magias, sem nenhum arquivo ignorado). O
bridge do Foundry não está configurado no ambiente local.

| Verificação | Resultado |
| --- | --- |
| Compêndio | Bestiário (147) e Grimório (417) em chips com contagem; tabela ordenável com dificuldade e Defesa/Vida. |
| Usar como base | Cria a cópia na biblioteca e abre o editor com a origem indicada ("Baseada em … do bestiário"). |
| Criar do zero | Na dificuldade 10, sugere "Defesa 14 e Vida 20, pela mediana de 25 criaturas". |
| Edição | Ao alterar o dano, o resumo do ataque muda e a barra fixa mostra "Alterações não salvas". |
| Grimório | A busca filtra por nome e tradição; "Adicionar" confirma a magia adicionada sem fechar o diálogo. |
| Salvar | Toast "Criatura salva"; a barra volta a "Salva em…" e a versão sobe. |
| Envio sem bridge | Aviso de mundos indisponíveis e "Enviar ao Foundry" desabilitado. |
| 375 px | Sem rolagem horizontal; a tabela vira cartões; atributos em duas colunas; a barra fixa ocupa a largura. |
| 768 px | Sem rolagem horizontal; seletores de campanha e área lado a lado; tabela do bestiário legível. |
| 1440 px | Características em seis colunas; itens de ataque e magia em duas colunas. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Médio | O diálogo do grimório só fechava por `Esc` ou clique fora. | Botão "Concluir" no rodapé. |
| Baixo | O título "Criaturas" se repetia no cabeçalho da página e no da Biblioteca. | A Biblioteca mostra a contagem ("1 criatura"). |

## Pendências aceitas

- O toast de "Criatura salva" cobre a barra fixa por alguns segundos no
  celular. Ele pode ser dispensado e não bloqueia o fluxo.
- O envio real só pode ser validado com o módulo 0.10.0 num mundo conectado.
  Até lá, a cobertura vem dos testes de API (importação, RBAC, versão e retorno
  do bridge) e dos testes do módulo.
- A imagem da criatura não é exibida no portal: os caminhos do Foundry são
  relativos ao servidor do mundo, que o portal não acessa.
