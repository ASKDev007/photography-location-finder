-- Public, minimal identity for Photowalk attendee lists.
-- Run through the Supabase SQL Editor or apply with the Supabase CLI.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  constraint profiles_display_name_not_blank
    check (char_length(btrim(display_name)) between 2 and 40),
  constraint profiles_display_name_trimmed
    check (display_name = btrim(display_name))
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;

grant select (id, display_name) on table public.profiles to authenticated;
grant insert (id, display_name) on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

create policy "Authenticated users can read public profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "Users can create only their own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update only their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '')
  );

  return new;
end;
$$;

revoke execute on function public.create_profile_for_new_user() from public;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row
  execute function public.create_profile_for_new_user();
