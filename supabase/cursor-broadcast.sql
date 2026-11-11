begin;

create policy "Document members can receive cursor broadcasts" on realtime.messages
  for select to authenticated using (
    extension = 'broadcast' and exists (
      select 1 from public.documents
      where 'document:' || id::text = (select realtime.topic())
    )
  );

create policy "Document members can send cursor broadcasts" on realtime.messages
  for insert to authenticated with check (
    extension = 'broadcast' and exists (
      select 1 from public.documents
      where 'document:' || id::text = (select realtime.topic())
    )
  );

commit;
