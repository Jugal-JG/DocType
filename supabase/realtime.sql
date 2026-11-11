begin;

alter table public.documents add column if not exists collaboration_state text
  check (length(collaboration_state) <= 8388608);
grant update (collaboration_state) on public.documents to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;
end;
$$;

drop policy if exists "Document members can see presence" on realtime.messages;
create policy "Document members can see presence" on realtime.messages
  for select to authenticated using (
    extension = 'presence' and exists (
      select 1 from public.documents
      where 'document:' || id::text = (select realtime.topic())
    )
  );

drop policy if exists "Document members can track presence" on realtime.messages;
create policy "Document members can track presence" on realtime.messages
  for insert to authenticated with check (
    extension = 'presence' and exists (
      select 1 from public.documents
      where 'document:' || id::text = (select realtime.topic())
    )
  );

commit;
