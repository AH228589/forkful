-- Forkful cloud sync. Every local IndexedDB record becomes one row, owned by the signed-in user.
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  store text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, store, id)
);

create index if not exists records_user_updated on public.records (user_id, updated_at);

-- Server clock decides updated_at, so device clocks never matter for the pull cursor.
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
for each row execute function public.records_touch();

alter table public.records enable row level security;

drop policy if exists "records: read own" on public.records;
drop policy if exists "records: insert own" on public.records;
drop policy if exists "records: update own" on public.records;
drop policy if exists "records: delete own" on public.records;
create policy "records: read own" on public.records for select to authenticated using (auth.uid() = user_id);
create policy "records: insert own" on public.records for insert to authenticated with check (auth.uid() = user_id);
create policy "records: update own" on public.records for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "records: delete own" on public.records for delete to authenticated using (auth.uid() = user_id);

-- Progress photos: private bucket, one folder per user (photos/<user id>/<photo id>.jpg).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos: read own" on storage.objects;
drop policy if exists "photos: insert own" on storage.objects;
drop policy if exists "photos: update own" on storage.objects;
drop policy if exists "photos: delete own" on storage.objects;
create policy "photos: read own" on storage.objects for select to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos: insert own" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos: update own" on storage.objects for update to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos: delete own" on storage.objects for delete to authenticated using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- AI meal scans: per-user daily counter so a leaked link can't run up the API bill.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security; -- no policies: only the service role reads or writes it

create or replace function public.ai_bump(uid uuid) returns int
language sql security definer set search_path = public as $$
  insert into public.ai_usage (user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = ai_usage.count + 1
  returning count
$$;
revoke execute on function public.ai_bump(uuid) from public, anon, authenticated;
