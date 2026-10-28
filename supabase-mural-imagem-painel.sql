alter table public.boards
  add column if not exists background_image_path text;

alter table public.boards
  drop constraint if exists boards_background_image_path_matches_share_code;

alter table public.boards
  add constraint boards_background_image_path_matches_share_code
  check (
    background_image_path is null
    or split_part(background_image_path, '/', 1) = share_code
  );

drop function if exists public.get_shared_board(text);

create function public.get_shared_board(p_share_code text)
returns table(
  id uuid,
  title text,
  description text,
  background_color text,
  background_image_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.title, b.description, b.background_color, b.background_image_path
  from public.boards b
  where b.share_code = p_share_code
    and b.allow_posts;
$$;

revoke all on function public.get_shared_board(text) from public;
grant execute on function public.get_shared_board(text) to anon, authenticated;

create or replace function public.broadcast_board_background_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.background_color is distinct from old.background_color
     or new.background_image_path is distinct from old.background_image_path then
    perform realtime.send(
      jsonb_build_object(
        'background_color', new.background_color,
        'background_image_path', new.background_image_path
      ),
      'board_changed',
      'mural:' || new.share_code,
      false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists board_background_changes_broadcast on public.boards;
create trigger board_background_changes_broadcast
after update of background_color, background_image_path on public.boards
for each row
execute function public.broadcast_board_background_changes();
