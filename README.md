# Postagens — murais colaborativos

Site de murais para reunir projetos de alunos por turma, tema ou evento.

## O que está preparado

- Vários murais para o professor organizar atividades.
- Alunos acessam pelo link/QR e publicam nome, título, descrição, texto, imagem ou GIF.
- Novas postagens são transmitidas ao mural aberto sem atualizar a página.
- O professor entra na conta para criar, editar e administrar os murais.
- Apresentação em tela cheia, impressão em PDF e cópia de segurança JSON.

## Ativar a sincronização na nuvem

O site está no GitHub Pages, mas precisa de um projeto Supabase para que a contribuição compartilhada funcione.

1. Crie um projeto Supabase chamado **Postagens**. Ao criar o projeto, defina a senha do banco diretamente no painel e guarde-a em um gerenciador de senhas. Não envie essa senha por mensagem e não a coloque no site.
2. No Supabase, abra **SQL Editor**, cole e execute o arquivo `supabase-postagens.sql`.
3. Em **Project Settings → API Keys**, copie o **Project URL** e a chave **publishable** (`sb_publishable_...`). Nunca use `service_role`, `secret` ou senha do banco no navegador.
4. Em `index.html` e `cloud.js`, substitua `https://SEU-PROJETO.supabase.co` e `COLE_SUA_CHAVE_PUBLICAVEL_AQUI` pelos valores do seu projeto. As duas chaves são dados públicos do cliente; a proteção dos dados é feita pelas regras no banco.
5. Em Authentication, configure a URL do site como `https://eltonjuniorferraz-design.github.io/Posts/`. Crie a conta de professor pelo botão **Entrar na nuvem → Criar conta** e confirme o e-mail.
6. Aguarde a publicação do GitHub Pages. Entre como professor, crie um mural e escolha **Compartilhar**. Envie o link/QR aos alunos.

## Acesso e privacidade

Os dados das tabelas não ficam abertos para consulta direta. O SQL usa regras para que o professor administre os próprios murais; os alunos só acessam os dados pelo código aleatório do link daquele mural e podem enviar postagens. Qualquer pessoa que receba o link pode visualizar e enviar conteúdo. A pasta de imagens usa URLs públicas para que os trabalhos apareçam sem login. Evite publicar dados pessoais sensíveis, fotos identificáveis ou informações que não tenham autorização para compartilhamento.

Sem o projeto Supabase e os valores públicos configurados nos dois arquivos, o site continua na prévia local e não sincroniza entre aparelhos.

## Publicação

O site está publicado em <https://eltonjuniorferraz-design.github.io/Posts/> pela branch `main` na pasta raiz.

