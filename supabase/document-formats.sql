begin;

alter table public.documents add column if not exists file_format text not null
  default 'docx' check (file_format in ('docx', 'md', 'txt'));
grant insert (file_format) on public.documents to authenticated;

commit;
