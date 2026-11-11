begin;

alter table public.documents add column if not exists deleted_at timestamptz;

create policy "Deleted documents are hidden" on public.documents
  as restrictive for select to authenticated using (deleted_at is null);
create policy "Deleted documents cannot be edited" on public.documents
  as restrictive for update to authenticated using (deleted_at is null) with check (deleted_at is null);

create function public.set_document_deleted(target_document uuid, undo boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.documents
  set deleted_at = case when undo then null else clock_timestamp() end
  where id = target_document and owner_id = (select auth.uid())
    and case when undo then deleted_at >= clock_timestamp() - interval '10 seconds'
             else deleted_at is null end;
  if not found then
    raise exception 'Document is unavailable or the undo period has ended.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.set_document_deleted(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_document_deleted(uuid, boolean) to authenticated;

create table public.document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default coalesce(nullif(split_part(auth.jwt()->>'email', '@', 1), ''), 'Collaborator'),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  quote text check (char_length(quote) <= 400),
  created_at timestamptz not null default now()
);
create index document_comments_document_idx on public.document_comments(document_id, created_at);
alter table public.document_comments enable row level security;
revoke all on public.document_comments from public, anon, authenticated;
grant select on public.document_comments to authenticated;
grant insert (document_id, body, quote) on public.document_comments to authenticated;
create policy "Document members can read comments" on public.document_comments
  for select to authenticated using (exists (select 1 from public.documents where id = document_id));
create policy "Document members can add comments" on public.document_comments
  for insert to authenticated with check (
    author_id = (select auth.uid()) and exists (select 1 from public.documents where id = document_id)
  );

create table public.document_versions (
  document_id uuid not null references public.documents(id) on delete cascade,
  bucket bigint not null,
  revision integer not null,
  title text not null,
  content jsonb not null,
  saved_at timestamptz not null,
  primary key (document_id, bucket)
);
alter table public.document_versions enable row level security;
revoke all on public.document_versions from public, anon, authenticated;
grant select on public.document_versions to authenticated;
create policy "Document members can read versions" on public.document_versions
  for select to authenticated using (exists (select 1 from public.documents where id = document_id));

create function public.record_document_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.document_versions values (new.id, -1, new.revision, new.title, new.content, new.updated_at);
  elsif new.title is distinct from old.title or new.content is distinct from old.content then
    insert into public.document_versions values (old.id, -1, old.revision, old.title, old.content, old.updated_at)
      on conflict (document_id, bucket) do nothing;
    insert into public.document_versions values (
      new.id, floor(extract(epoch from new.updated_at) / 60)::bigint,
      new.revision, new.title, new.content, new.updated_at
    ) on conflict (document_id, bucket) do update set
      revision = excluded.revision, title = excluded.title, content = excluded.content, saved_at = excluded.saved_at;
  end if;
  return new;
end;
$$;
revoke all on function public.record_document_version() from public, anon, authenticated;
create trigger document_version_recorded after insert or update of title, content on public.documents
  for each row execute function public.record_document_version();

insert into public.document_versions
select id, -1, revision, title, content, updated_at from public.documents where deleted_at is null;

create function public.checkpoint_document(target_document uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.document_versions
  select d.id, -2 - d.revision::bigint, d.revision, d.title, d.content, d.updated_at
  from public.documents d
  where d.id = target_document and d.deleted_at is null and (
    d.owner_id = (select auth.uid()) or exists (
      select 1 from public.document_shares s where s.document_id = d.id and s.recipient_id = (select auth.uid())
    )
  )
  on conflict (document_id, bucket) do nothing;
end;
$$;
revoke all on function public.checkpoint_document(uuid) from public, anon, authenticated;
grant execute on function public.checkpoint_document(uuid) to authenticated;

commit;
