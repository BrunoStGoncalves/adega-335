-- SOMENTE PARA TESTE LOCAL (Postgres puro). NÃO rode no Supabase: lá o schema auth já existe.
create role anon nologin; create role authenticated nologin;
create schema auth; create schema extensions;
create table auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, encrypted_password text, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
grant usage on schema auth, extensions to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on sequences to authenticated, anon;
