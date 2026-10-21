# Publicar no Google Workspace

## Antes de começar

Use a conta institucional que será responsável pelos arquivos. Não compartilhe senhas. Esta versão dá a todos os usuários explicitamente autorizados acesso aos registros, às fotos e à exportação, e permite registrar retiradas e devoluções. Não há papéis separados de administrador e operador. Autorize apenas pessoas que realmente precisam desses dados.

Se a organização bloquear Apps Script, permissões de Drive ou publicação de apps web, interrompa a publicação e use o modo local com dados fictícios para a apresentação. A autorização da TI não pode ser substituída pelo aplicativo. Não mova dados reais para uma conta pessoal para contornar a política.

## Instalação manual

1. Entre no Google com a conta institucional e abra https://script.google.com. Crie um projeto chamado **Frota**.
2. Copie o conteúdo de `Code.gs` deste diretório para o arquivo `Código.gs` do projeto.
3. Crie um arquivo HTML chamado **Index** e cole o conteúdo de `Index.html` deste diretório. Ele já está gerado; não é preciso executar Python na conta Google.
4. Nas configurações do projeto, habilite a exibição do arquivo de manifesto. Substitua `appsscript.json` pelo manifesto deste diretório. As permissões de Drive e Planilhas são necessárias para a conta proprietária criar e administrar os arquivos do app; são escopos amplos que a instituição pode bloquear.
5. Em **Configurações do projeto → Propriedades do script**, adicione:
   - `ALLOWED_DOMAIN`: domínio institucional, sem `@` (ex.: `instituicao.org.br`).
   - `ALLOWED_EMAILS`: e-mails institucionais autorizados, separados por vírgula. Inclua a conta proprietária. Não use curingas.
6. No editor, selecione e execute **setupEnvironment_** com a conta proprietária. Autorize os acessos somente se forem permitidos pela organização. A função cria uma planilha com abas **Viaturas** e **Emprestimos** e uma pasta de fotos no Drive; os IDs são salvos nas propriedades `SPREADSHEET_ID` e `PHOTO_FOLDER_ID`. Executá-la novamente reutiliza os IDs existentes. Se houver falha, confirme os arquivos já criados antes de repetir.
7. Confirme no Drive que a pasta e a planilha não estão públicas e não herdam permissões de pastas compartilhadas. Os usuários acessam os dados pelo app; não precisam de permissão de edição direta da planilha.
8. Em **Implantar → Nova implantação → Aplicativo da Web**, configure a execução como a conta proprietária e o acesso **somente aos usuários da organização**. Não escolha acesso anônimo ou público. Se a opção institucional não estiver disponível, pare e consulte o administrador; não amplie o acesso para contornar isso.
9. Copie o endereço `/exec` fornecido pelo Google. Esse é o endereço para abrir no celular ou computador. Após mudar o código, atualize a implantação com uma nova versão.

O servidor exige simultaneamente domínio autorizado e e-mail na lista. Em algumas políticas do Workspace, `Session.getActiveUser()` não fornece o e-mail nesse tipo de implantação. Nesse caso, o app deve negar acesso; não remova a validação. Será preciso ajustar a implantação com o administrador ou adotar outro backend com autenticação verificada.

## Validação antes da apresentação

Use registros e imagens fictícios:

1. Abra o endereço publicado com uma conta autorizada: o e-mail deve aparecer no cabeçalho.
2. Cadastre uma viatura, registre uma retirada com seis fotos e os três equipamentos e recarregue a página.
3. Abra em outro navegador autorizado. A viatura deve estar em uso e o histórico deve exibir as fotos.
4. Registre a devolução com odômetro igual ou maior, seis novas fotos e os equipamentos. Confira o percurso e a disponibilidade.
5. Confira as linhas na planilha e as 12 fotos privadas na pasta. O nome e a matrícula ficam na planilha; os arquivos no Drive recebem identificadores aleatórios.
6. Teste com uma conta institucional fora da lista e com uma conta externa: ambas devem ter acesso negado.
7. Abra duas sessões e tente salvar sobre dados desatualizados: a segunda deve solicitar recarregamento. O servidor usa trava e versão para evitar duas retiradas simultâneas da mesma viatura.

Não considere a integração validada antes desses testes reais. O ambiente de desenvolvimento não tem acesso à sua conta Google e não publicou nada.

## Dados e limites

- Todos os horários de gravação são definidos no servidor. O histórico registra o e-mail que fez cada operação; o locatário informado no formulário pode ser outra pessoa.
- As fotos são reduzidas no celular para JPEG. São exigidas seis por vistoria e até aproximadamente 900 KB por foto. Arquivos HEIC podem precisar ser convertidos pelo aparelho.
- O backend guarda referências às fotos na planilha e lê os arquivos pelo servidor autenticado. Não torna fotos públicas. A exportação JSON no modo Google contém IDs das fotos, não um backup das imagens. Faça backup da planilha e da pasta conforme as regras institucionais.
- Apps Script, Planilhas e Drive têm limites de execução, tamanho e armazenamento. Esta implementação atende demonstração e pilotos pequenos; valide volume e políticas antes de uso em produção. A leitura do histórico completo e fotos em base64 não é adequada para uma frota de grande volume.
- Não edite, remova ou reordene manualmente as linhas/abas durante o uso. As operações do app usam trava, mas edições diretas da planilha não a respeitam. Planilhas e Drive não fornecem uma transação conjunta; uma falha parcial de rede pode exigir reconciliação pelo administrador.
- As propriedades do script não contêm senhas. Restrinja quem pode editar o projeto Apps Script, pois editores têm acesso administrativo aos dados.

## Atualizar o HTML integrado

Após alterar `main.html`, `assets/style.css` ou `assets/index.js`, execute `python3 google-apps-script/build.py` na raiz do repositório e copie o novo `Index.html` para o Apps Script. A versão estática continua funcionando sem Google.

## Alternativa: demonstração na conta pessoal

Para apresentar sozinho com dados fictícios, use o mesmo procedimento na sua conta Gmail pessoal, com estas mudanças:

- `ALLOWED_DOMAIN`: `gmail.com` (ou o domínio exato da sua conta Google).
- `ALLOWED_EMAILS`: somente o seu e-mail pessoal completo.
- Implantação: executar como você; acesso **Somente eu**.

Abra o app estando conectado à mesma conta que publicou. Nenhuma outra pessoa deve ter acesso nessa configuração. Se mesmo assim o Google não disponibilizar a identidade da conta ou bloquear permissões, mantenha o app fechado e use o modo local para a apresentação. Não substitua a autorização por acesso anônimo.

Essa alternativa não configura login compartilhado de funcionários. Para isso, use a implantação institucional e as validações acima. Não transfira nomes, matrículas ou fotos reais de funcionários para a conta pessoal.
