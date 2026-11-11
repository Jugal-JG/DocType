begin;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb
    check (content->>'type' is not distinct from 'doc' and octet_length(content::text) <= 2097152),
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.document_shares (
  document_id uuid references public.documents(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  primary key (document_id, recipient_id)
);

create index documents_owner_idx on public.documents(owner_id);
create index document_shares_recipient_idx on public.document_shares(recipient_id);
alter table public.documents enable row level security;
alter table public.document_shares enable row level security;

revoke all on public.documents, public.document_shares from public, anon, authenticated;
grant select on public.documents, public.document_shares to authenticated;
grant insert (title, content), update (title, content) on public.documents to authenticated;

create policy "Recipients can see their grants" on public.document_shares
  for select to authenticated using (recipient_id = (select auth.uid()));

create policy "Owners and collaborators can read" on public.documents
  for select to authenticated using (
    owner_id = (select auth.uid()) or exists (
      select 1 from public.document_shares where document_id = documents.id
    )
  );

create policy "Owners can create" on public.documents
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "Owners and collaborators can save" on public.documents
  for update to authenticated using (
    owner_id = (select auth.uid()) or exists (
      select 1 from public.document_shares where document_id = documents.id
    )
  );

create function public.bump_document_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger document_saved before update on public.documents
  for each row execute function public.bump_document_revision();

create function public.share_document(target_document uuid, recipient_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  if not exists (
    select 1 from public.documents where id = target_document and owner_id = auth.uid()
  ) then
    raise exception 'Only the owner can share this document.' using errcode = '42501';
  end if;

  select id into recipient from auth.users
    where lower(email) = lower(btrim(recipient_email)) and last_sign_in_at is not null
    limit 1;
  if recipient is null then
    raise exception 'Ask the recipient to sign in before sharing.' using errcode = '22023';
  end if;
  if recipient = auth.uid() then
    raise exception 'You already own this document.' using errcode = '22023';
  end if;
  insert into public.document_shares values (target_document, recipient)
    on conflict do nothing;
end;
$$;
revoke all on function public.share_document(uuid, text) from public, anon, authenticated;
grant execute on function public.share_document(uuid, text) to authenticated;

commit;
