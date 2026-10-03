create table if not exists public.client_documents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id text not null,
  document_type text not null,
  file_name text not null,
  storage_path text not null unique,
  thumbnail_path text,
  mime_type text not null,
  file_size bigint not null check (file_size >= 0 and file_size <= 10485760),
  file_type text not null check (file_type in ('image','pdf')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.vehicle_images (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id text not null,
  storage_path text not null unique,
  thumbnail_path text not null unique,
  mime_type text not null check (mime_type in ('image/webp','image/jpeg','image/png')),
  file_size bigint not null check (file_size >= 0 and file_size <= 8388608),
  created_at timestamptz not null default now()
);

create index if not exists client_documents_owner_customer_idx on public.client_documents(user_id,customer_id);
create index if not exists vehicle_images_owner_vehicle_idx on public.vehicle_images(user_id,vehicle_id);

alter table public.client_documents enable row level security;
alter table public.client_documents force row level security;
alter table public.vehicle_images enable row level security;
alter table public.vehicle_images force row level security;
revoke all on public.client_documents,public.vehicle_images from anon;
grant select,insert,update,delete on public.client_documents,public.vehicle_images to authenticated;

drop policy if exists "client_documents_owner_select" on public.client_documents;
drop policy if exists "client_documents_owner_insert" on public.client_documents;
drop policy if exists "client_documents_owner_update" on public.client_documents;
drop policy if exists "client_documents_owner_delete" on public.client_documents;
create policy "client_documents_owner_select" on public.client_documents for select to authenticated using ((select auth.uid())=user_id);
create policy "client_documents_owner_insert" on public.client_documents for insert to authenticated with check ((select auth.uid())=user_id);
create policy "client_documents_owner_update" on public.client_documents for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "client_documents_owner_delete" on public.client_documents for delete to authenticated using ((select auth.uid())=user_id);

drop policy if exists "vehicle_images_owner_select" on public.vehicle_images;
drop policy if exists "vehicle_images_owner_insert" on public.vehicle_images;
drop policy if exists "vehicle_images_owner_update" on public.vehicle_images;
drop policy if exists "vehicle_images_owner_delete" on public.vehicle_images;
create policy "vehicle_images_owner_select" on public.vehicle_images for select to authenticated using ((select auth.uid())=user_id);
create policy "vehicle_images_owner_insert" on public.vehicle_images for insert to authenticated with check ((select auth.uid())=user_id);
create policy "vehicle_images_owner_update" on public.vehicle_images for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "vehicle_images_owner_delete" on public.vehicle_images for delete to authenticated using ((select auth.uid())=user_id);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values
  ('client-documents','client-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']),
  ('vehicle-images','vehicle-images',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "client_documents_storage_select" on storage.objects;
drop policy if exists "client_documents_storage_insert" on storage.objects;
drop policy if exists "client_documents_storage_update" on storage.objects;
drop policy if exists "client_documents_storage_delete" on storage.objects;
create policy "client_documents_storage_select" on storage.objects for select to authenticated using (bucket_id='client-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "client_documents_storage_insert" on storage.objects for insert to authenticated with check (bucket_id='client-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "client_documents_storage_update" on storage.objects for update to authenticated using (bucket_id='client-documents' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='client-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "client_documents_storage_delete" on storage.objects for delete to authenticated using (bucket_id='client-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists "vehicle_images_storage_select" on storage.objects;
drop policy if exists "vehicle_images_storage_insert" on storage.objects;
drop policy if exists "vehicle_images_storage_update" on storage.objects;
drop policy if exists "vehicle_images_storage_delete" on storage.objects;
create policy "vehicle_images_storage_select" on storage.objects for select to authenticated using (bucket_id='vehicle-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "vehicle_images_storage_insert" on storage.objects for insert to authenticated with check (bucket_id='vehicle-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "vehicle_images_storage_update" on storage.objects for update to authenticated using (bucket_id='vehicle-images' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='vehicle-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "vehicle_images_storage_delete" on storage.objects for delete to authenticated using (bucket_id='vehicle-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
