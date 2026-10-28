alter table public.boards
  add column if not exists background_color text not null default '#f7f5ef';

alter table public.boards
  drop constraint if exists boards_background_color_hex;

alter table public.boards
  add constraint boards_background_color_hex
  check (background_color ~ '^#[0-9A-Fa-f]{6}$');

drop function if exists public.get_shared_board(text);

create function public.get_shared_board(p_share_code text)
returns table(id uuid, title text, description text, background_color text)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.title, b.description, b.background_color
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
  if new.background_color is distinct from old.background_color then
    perform realtime.send(
      jsonb_build_object('background_color', new.background_color),
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
after update of background_color on public.boards
for each row
execute function public.broadcast_board_background_changes();
