# Revisão de UI/UX — Registro dos Corvos

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

### Contexto

- **Quem:** qualquer pessoa com acesso ao portal consulta; o mestre
  (`character:link:manage`) corrige e cadastra; quem publica missões
  (`mission:publish`) marca quem participou de cada uma.
- **Problema:** as informações dos personagens estão espalhadas (Foundry,
  fórum do Discord, memória do mestre) e só o próprio jogador vê a ficha.
- **Objetivo:** um catálogo público dos Corvos da Ordem, com imagem, nome,
  identificação, progresso, Vida na Sede e atributos, reaproveitando o que o
  portal já sabe e permitindo corrigir à mão.

### Modelo e origem dos dados

- Cada personagem vinculado (jogador ↔ ator do Foundry) ganha um Corvo
  automaticamente; o mestre também cadastra **Corvos avulsos** (mortos,
  aposentados, sem ator).
- Valores automáticos: nome, nível, ancestralidade, trilhas, atributos e
  status vêm do Foundry; jogador vem do vínculo; missões concluídas e
  fracassadas e a última missão vêm dos **participantes** marcados no registro
  de cada missão; sessões jogadas = sessões encerradas dessas missões;
  atividades = atividades da Vida na Sede resolvidas pelo mestre.
- Toda informação pode ser **corrigida**: o campo de correção vazio volta ao
  valor automático, que o editor mostra ao lado ("Automático: 2").
- Situação do Corvo: Na ativa, Aposentado ou Morto. "Mostrar no Registro dos
  Corvos" tira um Corvo da vista pública sem apagá-lo.

### Hierarquia e fluxo — portal público

- Menu: "Corvos" entre "Crônicas" e "Lojista"; atalho na página inicial.
- `/corvos` — "Registro dos Corvos": busca (nome, jogador, ancestralidade,
  trilha) e filtro de situação com contagem (Todos, Na ativa, Aposentados,
  Mortos). Cartões com a imagem em destaque (ou a inicial), nome, jogador,
  "Ancestralidade · Trilha · Nível N", selo de situação quando não está na
  ativa e as missões concluídas/fracassadas.
- `/corvos/[id]` — ficha: imagem grande e nome em destaque; blocos
  **Identificação** (jogador, ancestralidade, trilhas, nível), **Progresso**
  (sessões jogadas, missões concluídas, fracassadas), **Vida na Sede** (última
  missão, atividades realizadas), **Atributos e status** e a lista de
  **Missões** com link para cada registro. Valores desconhecidos aparecem como
  "—", nunca como zero inventado.
- A página de uma missão registrada lista a **Companhia** com links para as
  fichas.

### Hierarquia e fluxo — painel

- Nova área "Registro dos Corvos" (grupo Conteúdo): tabela com Corvo
  (imagem, nome, jogador), Origem (Foundry/Avulso), Situação, Registro
  (público/oculto) e ação "Editar"; "Novo Corvo avulso" no topo.
- Editor em diálogo, em seções: Identificação (nome, imagem, jogador, nome do
  jogador exibido, situação, mostrar no registro), Trilhas e nível, Progresso,
  Vida na Sede, Atributos e status. Cada campo de correção mostra o valor
  automático como texto de apoio.
- Registro da missão (área Missões): "Corvos que participaram", lista de
  caixas de seleção com busca, salva junto com o registro.

### Estados

Carregando (esqueletos com a forma dos cartões/ficha); registro vazio
(explica que os Corvos aparecem quando o mestre vincula personagens ou
cadastra avulsos); sem resultado para busca/filtro; Corvo não encontrado ou
oculto (404 com volta ao registro); sem imagem (inicial do nome); dados
parciais do Foundry ("—"); erro de versão ao salvar (mensagem e foco no
aviso); sem permissão (área e ações ocultas; backend responde 403).

### Acessibilidade

Imagem decorativa nos cartões (o nome está ao lado) e com `alt` na ficha;
listas de definição (`dl`) para os dados; situação sempre em texto; filtros
com `aria-pressed`; contagem em região viva; editor com rótulos persistentes
e foco no primeiro campo e no erro.

### Critérios de aceitação

- Vincular um personagem cria o Corvo, que aparece em `/corvos` com dados do
  Foundry sem cadastro adicional.
- Marcar um Corvo como participante de uma missão concluída soma 1 em
  "Missões concluídas" e define a "Última missão"; uma correção manual
  substitui o número e, apagada, volta ao automático.
- Corvo oculto some do hub e responde 404 ao público, mas continua no painel.
- Em 375 px, cartões e ficha sem rolagem horizontal; nomes longos quebram
  sem estourar o cartão.
- Editar e cadastrar exigem `character:link:manage` no backend; participantes
  exigem `mission:publish`.

## Validação renderizada

Portal local com a migração 0032, um personagem vinculado do Foundry
("Aster de Teste") e o mestre de teste.

| Verificação | Resultado |
| --- | --- |
| Backfill | A migração criou o Corvo do personagem já vinculado; ele aparece em `/corvos` com "Humano · Guerreiro · Nível 2" vindos do Foundry. |
| Editor | Seções Identificação, Trilhas e nível, Progresso, Vida na Sede, Atributos e status; cada correção mostra "Automático: …". "Jogador exibido" = "@Umamusume (Doug Jones)" → toast "Corvo atualizado". |
| Corvo avulso | Foco em "Nome"; nome longo, Morto, Fauno, Sacerdote, Nível 1 → cadastrado; no hub aparece com o selo "Morto". |
| Participantes | No registro de "Problemas na Vila de Asilo", os dois Corvos marcados → "Missões concluídas: 1" e "Última missão: Missão N° 001 - Problemas na Vila de Asilo" (link). |
| Ficha | Atributos e status do Foundry (Força 12 … Corrupção 0); atividades da Sede ("Lojista - Preparar Suprimentos; Escriba - Pesquisa"); avulso sem ficha mostra "—" nos 13 valores desconhecidos. |
| Companhia | A página da missão registrada lista os Corvos com link para a ficha. |
| Larguras | 375 px (hub, ficha e missão) sem rolagem horizontal; 1024 px com menu compacto; 1280 px com o menu completo numa linha. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Alto | Com o novo item "Corvos", o menu do topo em 1024 px quebrava "A Ordem" e "Minha área" em duas linhas. | Menu completo a partir de 1280 px (abaixo, o menu compacto) e rótulos sem quebra. |
| Médio | Na ficha em 1024 px, os blocos em duas colunas quebravam o nome do jogador no meio da palavra. | Blocos em coluna única até 1280 px. |
| Médio | Na "Companhia", um nome longo estourava 14 px em 375 px e o link tinha 36 px de altura. | Link quebra linha e tem no mínimo 44 px. |
| Baixo | O seletor de imagem dizia "Escolher a capa" no retrato do Corvo. | O seletor recebe o nome da imagem: "Escolher o retrato". |

## Pendências aceitas

- O retrato do Foundry é servido pelo portal a partir da miniatura que o
  módulo sincroniza; Corvos avulsos dependem de imagem enviada.
- Sessões jogadas contam sessões encerradas das missões em que o Corvo
  participou; sessões anteriores ao portal entram por correção manual.
