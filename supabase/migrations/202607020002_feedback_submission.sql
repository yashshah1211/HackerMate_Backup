-- Reliable feedback storage with server-side identity and validation.

create extension if not exists pgcrypto;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.feedback add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.feedback add column if not exists id uuid default gen_random_uuid();
alter table public.feedback add column if not exists user_email text;
alter table public.feedback add column if not exists type text;
alter table public.feedback add column if not exists message text;
alter table public.feedback add column if not exists created_at timestamptz default now();

create or replace function public.submit_feedback(
  p_type text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_message text := btrim(p_message);
  v_feedback_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_type not in ('suggestion', 'bug') then
    raise exception 'Invalid feedback type';
  end if;
  if v_message is null or char_length(v_message) < 3 then
    raise exception 'Feedback must contain at least 3 characters';
  end if;
  if char_length(v_message) > 5000 then
    raise exception 'Feedback cannot exceed 5000 characters';
  end if;

  insert into public.feedback (user_id, user_email, type, message)
  values (v_user_id, v_email, p_type, v_message)
  returning id into v_feedback_id;

  return v_feedback_id;
end;
$$;

alter table public.feedback enable row level security;

do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'feedback'
  loop
    execute format('drop policy if exists %I on public.feedback', r.policyname);
  end loop;
end $$;

revoke insert, update, delete on table public.feedback from anon, authenticated;
revoke all on function public.submit_feedback(text, text) from public;
grant execute on function public.submit_feedback(text, text) to authenticated;
