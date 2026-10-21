# Frota — Controle de viaturas

App em português para cadastro de viaturas, retirada e devolução, identificação do locatário, odômetro, equipamentos obrigatórios e seis fotos em cada vistoria. Inclui histórico e exportação JSON.

## Demonstração sem conta Google

O arquivo `apresentacao.html` contém o aplicativo completo (HTML, CSS e JavaScript), sem acesso ao Google. Para executar de forma consistente, use um servidor local. Em um computador com Python 3, execute na pasta do projeto:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra `apresentacao.html` ou `main.html` pelo servidor. `index.html` também é uma entrada para a mesma aplicação. Não há dependências de produção nem build para esse modo. Use dados fictícios. Os registros e fotos ficam no armazenamento desse navegador; não há login, sincronização entre pessoas ou backup automático. Limpar dados do navegador apaga os registros. Fotos são reduzidas para no máximo 1000 pixels para economizar espaço; não são preservadas como originais. A exportação JSON local contém as fotos, mas ainda não há importação pelo app.

## Google Workspace institucional

A integração preparada está em [google-apps-script/SETUP.md](google-apps-script/SETUP.md). Usa Apps Script para autenticação institucional e validações no servidor, Planilhas para registros e Drive privado para fotos. Esse modo não usa o armazenamento local como banco.

**Situação:** o fluxo local foi testado em navegador automatizado. O código Google foi preparado e testado com serviços simulados, mas precisa ser publicado e validado em uma conta real. Não há conexão institucional ativa neste repositório.

## Verificação

A sintaxe do frontend pode ser verificada com `node --check assets/index.js`. O teste `node tests/smoke.cjs` requer Playwright e Chromium, além do servidor em execução. Aceita `CHROMIUM_PATH` e `APP_URL`. Ele usa um contexto de navegador descartável com dados fictícios e verifica cadastro, retirada com fotos, persistência, odômetro mínimo, devolução, histórico, exportação e largura de tela móvel.

Execute `node tests/google-backend.cjs` para validar o contrato do backend Google com serviços simulados; isso não substitui a validação dentro do Workspace.
