# Postagens — murais de projetos

Protótipo de um espaço para professores reunirem projetos de alunos em murais por turma, tema ou evento.

## O que já funciona

- Criar e alternar entre vários murais.
- Adicionar, editar e remover postagens com nome, título, descrição, texto e imagem/GIF.
- Apresentar as postagens em tela cheia, navegar com as setas do teclado e sair com Esc.
- Imprimir o mural ou salvá-lo como PDF pela janela de impressão do navegador.
- Baixar e restaurar uma cópia JSON dos murais.
- Gerar QR code e link para o mural.

## Limite desta versão

Esta é uma prévia local: os murais ficam no armazenamento do navegador em que foram criados. O link e o QR code apontam para o site, mas ainda não sincronizam as postagens entre dispositivos. Para que alunos publiquem de seus próprios aparelhos e o professor reúna tudo em nuvem, falta conectar um serviço de banco de dados e armazenamento, com regras de acesso por mural.

Não coloque chaves administrativas ou `service_role` no código do navegador. A conexão em nuvem deve usar uma chave publicável e regras de segurança no banco.

## Publicar no GitHub Pages

O arquivo principal é `index.html`. No GitHub, abra **Settings → Pages**, selecione **Deploy from a branch**, escolha a branch `main` e a pasta `/(root)`, e salve. O endereço esperado será:

`https://eltonjuniorferraz-design.github.io/Posts/`

