# Demonstração — Consulta de processos na JUCEB integrada ao Pipefy

> Projeto de portfólio de **Victória Pedrosa**. **Demonstração** de consulta de processos na JUCEB integrada ao Pipefy — versão com dados fictícios (nomes, CNPJs, e-mails e IDs internos substituídos).

## Problema de negócio
Processos de abertura e alteração na JUCEB precisavam ser consultados manualmente e o Pipefy ficava desatualizado.

## Antes x depois
| | Antes | Depois |
|---|---|---|
| Como é feito | Equipe consultava o REGIN e atualizava os cards do Pipefy na mão. | Script consulta o REGIN/JUCEB automaticamente, atualiza os pipes de Abertura e Alteração e avisa no Slack. |

## Ganho
- Status societário sempre atualizado, sem consulta manual.

## Tecnologias
APIs REST, Google Apps Script, Pipefy API

## Arquivos
- `Codigo.gs`

## Como usar
Crie um projeto no Google Apps Script, copie os arquivos `.gs`/`.html` e configure as Propriedades do script indicadas no código.

## Autora
Victória Pedrosa — Product Owner do Time de IA, automação de processos contábeis e fiscais.
