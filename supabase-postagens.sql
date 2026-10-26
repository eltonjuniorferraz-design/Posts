-- Postagens: dados compartilhados por mural, acesso público somente via código secreto do link.
-- Rode este arquivo uma vez no SQL Editor do projeto Supabase do Postagens.
create extension if not exists pgcrypto;

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  share_code text not null unique check (share_code ~ '^[a-f0-9]{32}$'),
  allow_posts boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  body text not null default '' check (char_length(body) <= 3000),
  image_path text,
  created_at timestamptz not null default now()
);

alter table public.boards enable row level security;
alter table public.posts enable row level security;
revoke all on public.boards, public.posts from anon, authenticated;
grant select, insert, update, delete on public.boards, public.posts to authenticated;

drop policy if exists "Teachers manage their own boards" on public.boards;
create policy "Teachers manage their own boards" on public.boards
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Teachers manage posts on their boards" on public.posts;
create policy "Teachers manage posts on their boards" on public.posts
  for all to authenticated using (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = (select auth.uid()) )
  ) with check (
    exists (select 1 from public.boards b where b.id = board_id and b.owner_id = (select auth.uid()) )
  );

create or replace function public.get_shared_board(p_share_code text)
returns table(id uuid, title text, description text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.title, b.description
  from public.boards b
  where b.share_code = p_share_code and b.allow_posts;
$$;

create or replace function public.list_shared_posts(p_share_code text)
returns table(id uuid, author_name text, title text, description text, body text, image_path text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.author_name, p.title, p.description, p.body, p.image_path, p.created_at
  from public.posts p join public.boards b on b.id = p.board_id
  where b.share_code = p_share_code and b.allow_posts
  order by p.created_at desc;
$$;

create or replace function public.add_shared_post(
  p_share_code text, p_author_name text, p_title text,
  p_description text default '', p_body text default '', p_image_path text default null
)
returns table(id uuid, author_name text, title text, description text, body text, image_path text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_board_id uuid;
begin
  select b.id into v_board_id from public.boards b
  where b.share_code = p_share_code and b.allow_posts;
  if v_board_id is null then raise exception 'Mural inválido ou fechado.'; end if;
  if length(trim(coalesce(p_author_name,''))) not between 1 and 80 then raise exception 'Informe um nome de até 80 caracteres.'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 100 then raise exception 'Informe um título de até 100 caracteres.'; end if;
  if length(coalesce(p_description,'')) > 500 or length(coalesce(p_body,'')) > 3000 then raise exception 'O texto excede o limite permitido.'; end if;
  if p_image_path is not null and split_part(p_image_path,'/',1) <> p_share_code then raise exception 'Imagem inválida para este mural.'; end if;
  return query insert into public.posts(board_id,author_name,title,description,body,image_path)
    values(v_board_id,trim(p_author_name),trim(p_title),coalesce(p_description,''),coalesce(p_body,''),p_image_path)
    returning posts.id,posts.author_name,posts.title,posts.description,posts.body,posts.image_path,posts.created_at;
end;
$$;

create or replace function public.valid_post_image_path(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.boards b
    where b.share_code = split_part(p_name,'/',1) and b.allow_posts);
$$;

revoke all on function public.get_shared_board(text) from public;
revoke all on function public.list_shared_posts(text) from public;
revoke all on function public.add_shared_post(text,text,text,text,text,text) from public;
revoke all on function public.valid_post_image_path(text) from public;
grant execute on function public.get_shared_board(text) to anon, authenticated;
grant execute on function public.list_shared_posts(text) to anon, authenticated;
grant execute on function public.add_shared_post(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.valid_post_image_path(text) to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('post-images','post-images',true,3145728,array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do update set public=true,file_size_limit=3145728,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Shared mural visitors may upload images" on storage.objects;
create policy "Shared mural visitors may upload images" on storage.objects
  for insert to anon, authenticated with check (
    bucket_id = 'post-images' and public.valid_post_image_path(name)
  );

create or replace function public.broadcast_post_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_board_id uuid; v_code text;
begin
  v_board_id := case when tg_op = 'DELETE' then old.board_id else new.board_id end;
  select b.share_code into v_code from public.boards b where b.id = v_board_id;
  if v_code is not null then
    perform realtime.send(jsonb_build_object('refresh',true),'posts_changed','mural:'||v_code,false);
  end if;
  return null;
end;
$$;

drop trigger if exists post_changes_broadcast on public.posts;
create trigger post_changes_broadcast after insert or update or delete on public.posts
  for each row execute function public.broadcast_post_changes();


