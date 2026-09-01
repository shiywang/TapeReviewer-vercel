-- Allow import_batch.source = 'ibkr' (IBKR Flex Web Service sync).
-- Run once in the Supabase SQL Editor on an existing project.
-- (Fresh projects created from schema.sql already include 'ibkr'.)
alter table import_batch drop constraint if exists import_batch_source_check;
alter table import_batch
  add constraint import_batch_source_check check (source in ('das', 'csv', 'ibkr'));
