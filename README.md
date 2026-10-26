# Muralê — murais colaborativos

Muralê é um espaço para reunir e apresentar projetos de alunos por turma, tema ou evento.

## Status

O site está publicado e conectado ao projeto Supabase. O banco já tem as tabelas, regras de acesso e atualizações ao vivo configuradas.

- Professor cria uma conta, confirma o e-mail e entra para administrar murais.
- Alunos acessam o mural por link ou QR e enviam nome, título, descrição, texto, imagem ou GIF.
- Novas postagens aparecem no mural aberto automaticamente.
- O professor pode apresentar os projetos, imprimir em PDF e baixar cópia de segurança.
- Conteúdo que estava salvo apenas no navegador não foi copiado para a nuvem.

## Primeiro acesso

1. Abra [Muralê](https://eltonjuniorferraz-design.github.io/Posts/).
2. Escolha **Entrar na nuvem → Criar conta** e confirme o endereço pelo e-mail.
3. Entre, crie um mural e escolha **Compartilhar** para gerar link e QR dos alunos.

## Acesso e privacidade

O professor administra os próprios murais. Alunos não precisam de conta: o código aleatório no link dá acesso àquele mural para visualizar e enviar projetos. Qualquer pessoa que receba o link poderá participar. As imagens usam URLs públicas para aparecer sem login. Evite dados pessoais sensíveis, fotos identificáveis e informações sem autorização de compartilhamento.

A chave **publishable** do Supabase usada no navegador é pública por definição; as permissões são controladas pelas regras do banco. Nunca coloque chaves **secret/service_role** nem a senha do banco no site.

O banco Supabase foi criado na região **East US (North Virginia)**.

## Repositório e publicação

O site está publicado pelo GitHub Pages a partir da branch `main`, pasta raiz: https://eltonjuniorferraz-design.github.io/Posts/.
