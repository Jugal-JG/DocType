begin;

alter table public.document_comments add column if not exists anchor jsonb
  check (anchor is null or octet_length(anchor::text) <= 4096);
grant insert (anchor) on public.document_comments to authenticated;

commit;
