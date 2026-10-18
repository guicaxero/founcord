# Revisão de UI/UX — Registro de missões

Revisão contra o [padrão de UI/UX](../padrao-de-ui-ux.md).

## Especificação

### Contexto

- **Quem:** visitantes e jogadores consultam; o mestre (`mission:publish`)
  registra.
- **Problema:** o quadro de Missões mistura o chamado (inscrição) com o
  histórico das aventuras, que hoje só existe no Discord.
- **Objetivo:** separar as duas funções. "Chamados abertos" continua sendo o
  lugar de demonstrar interesse e se inscrever; "Registro de missões" vira o
  arquivo permanente, com número, nome, situação e o relato da aventura.

### Modelo

- A missão continua uma só entidade. Ela ganha **número** (Missão N° 001),
  **situação no registro** (`outcome`: em andamento, concluída ou fracassada;
  vazio = ainda é um chamado aberto), **relato** e a data do último registro.
- Chamado aberto = publicada e sem situação no registro. Ao registrar a
  partida ("Em andamento"), a missão sai do quadro, para de aceitar inscrições
  e entra no registro.
- Missões antigas entram pelo botão "Registrar missão antiga", já publicadas
  no registro (a importação do fórum do Discord vem em PR próprio).

### Hierarquia e fluxo — portal público

- `/missoes` e `/missoes/registro` têm o mesmo seletor no topo: "Chamados
  abertos" e "Registro de missões" (links, com `aria-current="page"`).
- **Registro:** cabeçalho "Registro de missões"; filtros com contagem (Todas,
  Em andamento, Concluídas, Fracassadas) e busca (número, nome, região,
  relato). Ordem: número decrescente; sem número, pela data do registro.
  Cartão: capa (se houver), "Missão N° 001", nome, selo de situação com texto,
  região, trecho do relato (ou do chamado) e "Ler o registro".
- **Página da missão registrada:** "← Voltar ao registro", "Missão N° 001 ·
  região", nome, selo de situação, capa, relato completo em largura de
  leitura e os dados do chamado (risco, duração, registrado em). Sem botão de
  inscrição.

### Hierarquia e fluxo — painel (Missões)

- Coluna "Registro" na tabela: "Chamado aberto" ou o selo da situação com o
  número.
- Ação "Registrar" (ou "Atualizar registro") nas missões publicadas, para
  quem tem `mission:publish`: diálogo "Registro da missão" com Número
  (opcional, único na campanha), Situação no registro (Chamado aberto /
  Em andamento / Concluída / Fracassada) e Relato.
- "Registrar missão antiga" ao lado de "Nova missão": o formulário da missão
  sem vagas e partida, mais número, situação e relato; salva direto no
  registro público.

### Estados

Carregando (esqueleto de cartões); registro vazio ("Nenhuma missão no registro
ainda" + o que aparece ali); sem resultado para filtro/busca (com "Limpar busca
e filtros"); erro recuperável ("Tentar novamente"); número repetido (erro no
formulário, valores preservados); missão não publicada (o painel só oferece
"Registrar" para publicadas); inscrição em missão que já partiu (`409`, a
página registrada não mostra o botão).

### Acessibilidade

Seletor de seção como navegação com `aria-label` e `aria-current`; filtros com
`aria-pressed` (`FilterChips`); contagem anunciada em região viva; situação
sempre em texto, nunca só pela cor; diálogos com foco no primeiro campo e
retorno ao botão que os abriu.

### Critérios de aceitação

- Uma missão publicada sem situação aparece em "Chamados abertos" e não no
  registro; ao receber "Em andamento", sai do quadro, aparece no registro e a
  inscrição responde `409`.
- O registro filtra por situação e busca por número ("001"), nome e relato.
- Em 375 px, seletor, filtros e cartões cabem sem rolagem horizontal.
- Registrar exige `mission:publish` no backend; número repetido responde
  `409 mission_number_taken` e o formulário mantém os valores.

## Validação renderizada

Portal local com a migração 0031 e o mestre de teste (`owner`).

| Verificação | Resultado |
| --- | --- |
| Registrar missão antiga | Diálogo com foco em "Nome da missão"; "Problemas na Vila de Asilo", N° 1, Concluída, relato com negrito → toast "Missão registrada — … já está no registro público." |
| Registrar missão publicada | "Registrar" abre "Registro da missão" com foco em "Situação no registro"; Em andamento + N° 2 → toast "Registro atualizado"; a missão some de "Chamados abertos". |
| Número repetido | N° 1 de novo → "Já existe uma missão com esse número no registro.", valores preservados, foco no aviso. |
| Registro público | Seletor com `aria-current="page"` em "Registro de missões"; filtros com contagem; busca "001" → "1 de 2 missões correspondem à consulta." |
| Página da missão registrada | "← Voltar ao registro", "Missão N° 001 · Vila de Asilo", selo Concluída, relato em parágrafos; nenhum botão de inscrição. |
| Larguras | 375 px (registro e página da missão) e 768 px (quadro) sem rolagem horizontal; tabela do painel em 1024 px com 655/655 px. |

## Achados

| Impacto | Evidência | Correção |
| --- | --- | --- |
| Médio | A nova coluna "Registro" fazia a tabela do painel passar 46 px da largura em 1024 px. | Registro passou para dentro da coluna "Situação" (selo + número abaixo). |
| Médio | O filtro do painel "Em andamento" (missões não arquivadas) usava o mesmo termo da situação do registro. | Renomeado para "Ativas". |
| Médio | O erro do formulário era anunciado, mas o foco ficava no primeiro campo, contra o padrão. | Os dois formulários de missão levam o foco ao aviso de erro. |
| Baixo | O selo "Em andamento · N° 002" quebrava em três linhas na coluna estreita. | Número como texto abaixo do selo. |
| Baixo | A aba do navegador dizia "Chamado" também nas missões registradas. | Título genérico "Missão". |

## Pendências aceitas

- Os participantes de cada missão e as contagens por Corvo chegam com o
  Registro dos Corvos (PR seguinte da pilha).
- A importação das missões antigas do fórum do Discord fica em PR próprio.
