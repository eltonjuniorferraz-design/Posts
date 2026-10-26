-- Muralê: cores por postagem e edição segura pelo autor no mesmo aparelho.
-- Execute no SQL Editor do projeto Supabase usado pelo site.
create extension if not exists pgcrypto;

alter table public.posts
  add column if not exists media_color text not null default '#eff2ed',
  add column if not exists card_color text not null default '#ffffff',
  add column if not exists edit_token_hash text;

alter table public.posts drop constraint if exists posts_media_color_hex;
alter table public.posts add constraint posts_media_color_hex check (media_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.posts drop constraint if exists posts_card_color_hex;
alter table public.posts add constraint posts_card_color_hex check (card_color ~ '^#[0-9A-Fa-f]{6}$');

drop function if exists public.list_shared_posts(text);
create function public.list_shared_posts(p_share_code text)
returns table(id uuid, author_name text, title text, description text, body text, image_path text, media_color text, card_color text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.author_name, p.title, p.description, p.body, p.image_path,
         p.media_color, p.card_color, p.created_at
  from public.posts p join public.boards b on b.id = p.board_id
  where b.share_code = p_share_code and b.allow_posts
  order by p.created_at desc;
$$;

create or replace function public.add_shared_post(
  p_share_code text, p_author_name text, p_title text,
  p_description text, p_body text, p_image_path text,
  p_media_color text, p_card_color text
)
returns table(id uuid, author_name text, title text, description text, body text, image_path text, media_color text, card_color text, created_at timestamptz, edit_token text)
language plpgsql security definer set search_path = '' as $$
declare v_board_id uuid; v_token text;
begin
  select b.id into v_board_id from public.boards b
  where b.share_code = p_share_code and b.allow_posts;
  if v_board_id is null then raise exception 'Mural inválido ou fechado.'; end if;
  if length(trim(coalesce(p_author_name,''))) not between 1 and 80 then raise exception 'Informe um nome de até 80 caracteres.'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 100 then raise exception 'Informe um título de até 100 caracteres.'; end if;
  if length(coalesce(p_description,'')) > 500 or length(coalesce(p_body,'')) > 3000 then raise exception 'O texto excede o limite permitido.'; end if;
  if p_image_path is not null and split_part(p_image_path,'/',1) <> p_share_code then raise exception 'Imagem inválida para este mural.'; end if;
  if coalesce(p_media_color,'') !~ '^#[0-9A-Fa-f]{6}$' or coalesce(p_card_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Escolha cores válidas.'; end if;
  v_token := encode(extensions.gen_random_bytes(24),'hex');
  return query insert into public.posts(board_id,author_name,title,description,body,image_path,media_color,card_color,edit_token_hash)
    values(v_board_id,trim(p_author_name),trim(p_title),coalesce(p_description,''),coalesce(p_body,''),p_image_path,p_media_color,p_card_color,encode(extensions.digest(v_token,'sha256'),'hex'))
    returning posts.id,posts.author_name,posts.title,posts.description,posts.body,posts.image_path,posts.media_color,posts.card_color,posts.created_at,v_token;
end;
$$;

create or replace function public.update_shared_post(
  p_share_code text, p_post_id uuid, p_edit_token text,
  p_author_name text, p_title text, p_description text,
  p_body text, p_image_path text, p_media_color text, p_card_color text
)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if length(trim(coalesce(p_author_name,''))) not between 1 and 80 then raise exception 'Informe um nome de até 80 caracteres.'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 100 then raise exception 'Informe um título de até 100 caracteres.'; end if;
  if length(coalesce(p_description,'')) > 500 or length(coalesce(p_body,'')) > 3000 then raise exception 'O texto excede o limite permitido.'; end if;
  if p_image_path is not null and split_part(p_image_path,'/',1) <> p_share_code then raise exception 'Imagem inválida para este mural.'; end if;
  if coalesce(p_media_color,'') !~ '^#[0-9A-Fa-f]{6}$' or coalesce(p_card_color,'') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Escolha cores válidas.'; end if;
  update public.posts p set author_name=trim(p_author_name), title=trim(p_title),
    description=coalesce(p_description,''), body=coalesce(p_body,''),
    image_path=p_image_path, media_color=p_media_color, card_color=p_card_color
  from public.boards b
  where p.id=p_post_id and p.board_id=b.id and b.share_code=p_share_code and b.allow_posts
    and p.edit_token_hash=encode(extensions.digest(coalesce(p_edit_token,''),'sha256'),'hex');
  get diagnostics v_count = row_count;
  if v_count=0 then raise exception 'Código de edição inválido. Abra o link no aparelho usado para enviar a postagem.'; end if;
  return true;
end;
$$;

revoke all on function public.list_shared_posts(text) from public;
revoke all on function public.add_shared_post(text,text,text,text,text,text,text,text) from public;
revoke all on function public.update_shared_post(text,uuid,text,text,text,text,text,text,text,text) from public;
grant execute on function public.list_shared_posts(text) to anon, authenticated;
grant execute on function public.add_shared_post(text,text,text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.update_shared_post(text,uuid,text,text,text,text,text,text,text,text) to anon, authenticated;
