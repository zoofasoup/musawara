begin;

drop policy if exists "anyone may submit an application" on public.job_applications;
revoke all on table public.job_applications from public, anon, authenticated;
grant insert on table public.job_applications to service_role;

commit;
