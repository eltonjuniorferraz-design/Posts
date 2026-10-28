-- Muralê: reações de coração e joinha nos projetos da turma.
-- Execute no SQL Editor do Supabase do projeto Postagens.
create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  voter_id uuid not null,
  reaction text not null check (reaction in ('heart','thumb')),
  updated_at timestamptz not null default now(),
  constraint post_reactions_one_per_voter_per_post primary key (post_id,voter_id)
);

alter table public.post_reactions enable row level security;
revoke all on public.post_reactions from public, anon, authenticated;

drop function if exists public.list_shared_posts(text,uuid);
drop function if exists public.list_shared_posts(text);
create function public.list_shared_posts(p_share_code text,p_voter_id uuid default null)
returns table(
  id uuid, author_name text, title text, description text, body text,
  image_path text, media_color text, card_color text, created_at timestamptz,
  heart_count integer, thumb_count integer, my_reactions text[]
)
language sql stable security definer set search_path = '' as $$
  select p.id,p.author_name,p.title,p.description,p.body,p.image_path,
    p.media_color,p.card_color,p.created_at,
    (select count(*)::integer from public.post_reactions r where r.post_id=p.id and r.reaction='heart'),
    (select count(*)::integer from public.post_reactions r where r.post_id=p.id and r.reaction='thumb'),
    coalesce(
      (select array_agg(r.reaction) from public.post_reactions r
       where r.post_id=p.id and r.voter_id=p_voter_id),
      array[]::text[]
    )
  from public.posts p join public.boards b on b.id=p.board_id
  where b.share_code=p_share_code and b.allow_posts
  order by p.created_at desc;
$$;

create or replace function public.toggle_shared_reaction(
  p_share_code text,p_post_id uuid,p_voter_id uuid,p_reaction text
)
returns table(heart_count integer,thumb_count integer,active boolean)
language plpgsql security definer set search_path = '' as $$
declare v_board_id uuid;v_current text;v_active boolean:=false;
begin
  if p_voter_id is null then raise exception 'Não foi possível identificar este navegador.'; end if;
  if p_reaction not in ('heart','thumb') then raise exception 'Reação inválida.'; end if;
  select b.id into v_board_id
    from public.boards b join public.posts p on p.board_id=b.id
    where b.share_code=p_share_code and b.allow_posts and p.id=p_post_id;
  if v_board_id is null then raise exception 'Projeto ou mural inválido.'; end if;

  select r.reaction into v_current from public.post_reactions r
    where r.post_id=p_post_id and r.voter_id=p_voter_id for update;
  if v_current=p_reaction then
    delete from public.post_reactions where post_id=p_post_id and voter_id=p_voter_id;
    v_active:=false;
  elsif v_current is null then
    insert into public.post_reactions(post_id,voter_id,reaction)
      values(p_post_id,p_voter_id,p_reaction)
      on conflict (post_id,voter_id) do update set reaction=excluded.reaction,updated_at=now();
    v_active:=true;
  else
    update public.post_reactions set reaction=p_reaction,updated_at=now()
      where post_id=p_post_id and voter_id=p_voter_id;
    v_active:=true;
  end if;
  return query select
    (select count(*)::integer from public.post_reactions r where r.post_id=p_post_id and r.reaction='heart'),
    (select count(*)::integer from public.post_reactions r where r.post_id=p_post_id and r.reaction='thumb'),
    v_active;
end;
$$;

create or replace function public.broadcast_reaction_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_post_id uuid;v_code text;
begin
  v_post_id:=case when tg_op='DELETE' then old.post_id else new.post_id end;
  select b.share_code into v_code
    from public.posts p join public.boards b on b.id=p.board_id
    where p.id=v_post_id;
  if v_code is not null then
    perform realtime.send(jsonb_build_object('refresh',true),'posts_changed','mural:'||v_code,false);
  end if;
  return null;
end;
$$;

drop trigger if exists reaction_changes_broadcast on public.post_reactions;
create trigger reaction_changes_broadcast
after insert or update or delete on public.post_reactions
for each row execute function public.broadcast_reaction_changes();

revoke all on function public.list_shared_posts(text,uuid) from public;
revoke all on function public.toggle_shared_reaction(text,uuid,uuid,text) from public;
grant execute on function public.list_shared_posts(text,uuid) to anon,authenticated;
grant execute on function public.toggle_shared_reaction(text,uuid,uuid,text) to anon,authenticated;
