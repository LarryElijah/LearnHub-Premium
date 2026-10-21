-- LearnHub complete fresh-install schema for Supabase
-- IMPORTANT:
-- 1. Use only for a new/empty LearnHub schema. Back up production first.
-- 2. This schema assumes app tables: profiles, tasks, classes, class_members,
--    assignments, submissions, quiz_results.
-- 3. Class joining by code and quiz scoring should be implemented server-side.
-- 4. After this script succeeds, bootstrap the first admin separately (instructions below).

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- PROFILES / ROLES
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'student'
    check (role in ('student', 'teacher', 'admin')),
  teacher_approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Every new account starts as a student. Client metadata cannot set role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role, teacher_approved)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
    ),
    'student',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for existing auth users. Existing profiles are unchanged.
insert into public.profiles (id, role, teacher_approved)
select u.id, 'student', false
from auth.users u
on conflict (id) do nothing;

-- ============================================================
-- ROLE HELPERS
-- SECURITY DEFINER is used to avoid recursive profile RLS checks.
-- ============================================================
create or replace function public.current_learnhub_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role = 'admin' then 'admin'
    when p.role = 'teacher' and p.teacher_approved then 'teacher'
    else 'student'
  end
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_learnhub_role() = 'admin', false);
$$;

create or replace function public.is_teacher_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.current_learnhub_role() in ('teacher', 'admin'),
    false
  );
$$;

revoke all on function public.current_learnhub_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_teacher_or_admin() from public, anon;
grant execute on function public.current_learnhub_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_teacher_or_admin() to authenticated;

-- ============================================================
-- TASKS (simple personal task list)
-- ============================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  is_completed boolean not null default false,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- CLASSES / MEMBERS
-- ============================================================
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  teacher_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

-- ============================================================
-- ASSIGNMENTS / SUBMISSIONS
-- ============================================================
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  teacher_id uuid not null references public.profiles(id),
  class_id uuid references public.classes(id) on delete cascade,
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  response jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'reviewed')),
  score numeric check (score is null or score >= 0),
  teacher_feedback text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id),
  check (
    (status <> 'reviewed')
    or reviewed_at is not null
  )
);

-- ============================================================
-- QUIZ RESULTS
-- Score-writing should be done by a trusted server-side scorer.
-- ============================================================
create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quiz_id text not null,
  score numeric not null check (score >= 0),
  total numeric not null check (total > 0 and score <= total),
  created_at timestamptz not null default now()
);

-- ============================================================
-- ENABLE RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.quiz_results enable row level security;

-- Least-privilege grants. Profiles are read-only to clients.
revoke all on public.profiles, public.tasks, public.classes,
  public.class_members, public.assignments, public.submissions,
  public.quiz_results from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, delete on public.class_members to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
grant select on public.submissions to authenticated;
grant select on public.quiz_results to authenticated;

-- Drop policies created by this script so it can be re-run safely.
drop policy if exists "profiles select own or admin" on public.profiles;
drop policy if exists "tasks owner all" on public.tasks;
drop policy if exists "classes select permitted" on public.classes;
drop policy if exists "classes insert teacher" on public.classes;
drop policy if exists "classes update teacher admin" on public.classes;
drop policy if exists "classes delete teacher admin" on public.classes;
drop policy if exists "class members select permitted" on public.class_members;
drop policy if exists "class members insert teacher admin" on public.class_members;
drop policy if exists "class members delete teacher admin" on public.class_members;
drop policy if exists "assignments select permitted" on public.assignments;
drop policy if exists "assignments insert teacher" on public.assignments;
drop policy if exists "assignments update teacher admin" on public.assignments;
drop policy if exists "assignments delete teacher admin" on public.assignments;
drop policy if exists "submissions select permitted" on public.submissions;
drop policy if exists "quiz results select owner admin" on public.quiz_results;

-- Profiles: users can read only themselves; admins can read all.
create policy "profiles select own or admin"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

-- Tasks: each user manages their own tasks.
create policy "tasks owner all"
on public.tasks for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Classes: visible to assigned teacher, class members, or admins.
create policy "classes select permitted"
on public.classes for select to authenticated
using (
  teacher_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1 from public.class_members cm
    where cm.class_id = classes.id
      and cm.student_id = (select auth.uid())
  )
);

create policy "classes insert teacher"
on public.classes for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and (select public.is_teacher_or_admin())
);

create policy "classes update teacher admin"
on public.classes for update to authenticated
using (teacher_id = (select auth.uid()) or (select public.is_admin()))
with check (
  (select public.is_admin())
  or (
    teacher_id = (select auth.uid())
    and (select public.is_teacher_or_admin())
  )
);

create policy "classes delete teacher admin"
on public.classes for delete to authenticated
using (teacher_id = (select auth.uid()) or (select public.is_admin()));

-- Membership: teachers can manage membership only in their own classes.
create policy "class members select permitted"
on public.class_members for select to authenticated
using (
  student_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1 from public.classes c
    where c.id = class_members.class_id
      and c.teacher_id = (select auth.uid())
  )
);

create policy "class members insert teacher admin"
on public.class_members for insert to authenticated
with check (
  (select public.is_admin())
  or (
    (select public.is_teacher_or_admin())
    and exists (
      select 1 from public.classes c
      where c.id = class_members.class_id
        and c.teacher_id = (select auth.uid())
    )
  )
);

create policy "class members delete teacher admin"
on public.class_members for delete to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1 from public.classes c
    where c.id = class_members.class_id
      and c.teacher_id = (select auth.uid())
  )
);

-- Assignments: class members can read class assignments; teachers/admins
-- can manage assignments subject to ownership/class ownership checks.
create policy "assignments select permitted"
on public.assignments for select to authenticated
using (
  teacher_id = (select auth.uid())
  or (select public.is_admin())
  or (
    class_id is not null
    and exists (
      select 1 from public.class_members cm
      where cm.class_id = assignments.class_id
        and cm.student_id = (select auth.uid())
    )
  )
);

create policy "assignments insert teacher"
on public.assignments for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and (select public.is_teacher_or_admin())
  and (
    class_id is null
    or (select public.is_admin())
    or exists (
      select 1 from public.classes c
      where c.id = assignments.class_id
        and c.teacher_id = (select auth.uid())
    )
  )
);

create policy "assignments update teacher admin"
on public.assignments for update to authenticated
using (teacher_id = (select auth.uid()) or (select public.is_admin()))
with check (
  (select public.is_admin())
  or (
    teacher_id = (select auth.uid())
    and (select public.is_teacher_or_admin())
    and (
      class_id is null
      or exists (
        select 1 from public.classes c
        where c.id = assignments.class_id
          and c.teacher_id = (select auth.uid())
      )
    )
  )
);

create policy "assignments delete teacher admin"
on public.assignments for delete to authenticated
using (teacher_id = (select auth.uid()) or (select public.is_admin()));

-- Submissions and quiz results are read-only to clients by default.
create policy "submissions select permitted"
on public.submissions for select to authenticated
using (
  student_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1 from public.assignments a
    where a.id = submissions.assignment_id
      and a.teacher_id = (select auth.uid())
  )
);

create policy "quiz results select owner admin"
on public.quiz_results for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ============================================================
-- SECURE SUBMISSION RPCS
-- Students can submit/update response/status only; cannot set score,
-- teacher_feedback, or reviewed_at.
-- ============================================================
create or replace function public.save_submission(
  p_assignment_id uuid,
  p_response jsonb,
  p_status text default 'submitted'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null
     or public.current_learnhub_role() <> 'student' then
    raise exception 'Student access required' using errcode = '42501';
  end if;

  if p_status not in ('draft', 'submitted') or p_response is null then
    raise exception 'Invalid submission data';
  end if;

  if not exists (
    select 1
    from public.assignments a
    where a.id = p_assignment_id
      and (
        a.class_id is null
        or exists (
          select 1 from public.class_members cm
          where cm.class_id = a.class_id
            and cm.student_id = (select auth.uid())
        )
      )
  ) then
    raise exception 'Assignment unavailable' using errcode = '42501';
  end if;

  insert into public.submissions (assignment_id, student_id, response, status)
  values (p_assignment_id, (select auth.uid()), p_response, p_status)
  on conflict (assignment_id, student_id)
  do update set
    response = excluded.response,
    status = excluded.status,
    updated_at = now()
  where public.submissions.status <> 'reviewed'
  returning id into v_id;

  if v_id is null then
    raise exception 'Submission has already been reviewed';
  end if;

  return v_id;
end;
$$;

create or replace function public.review_submission(
  p_submission_id uuid,
  p_score numeric,
  p_feedback text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_score is not null and p_score < 0 then
    raise exception 'Score cannot be negative';
  end if;

  if not (
    (select public.is_admin())
    or exists (
      select 1
      from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.id = p_submission_id
        and a.teacher_id = (select auth.uid())
        and (select public.is_teacher_or_admin())
    )
  ) then
    raise exception 'Not authorized to review this submission'
      using errcode = '42501';
  end if;

  update public.submissions
  set score = p_score,
      teacher_feedback = p_feedback,
      status = 'reviewed',
      reviewed_at = now(),
      updated_at = now()
  where id = p_submission_id;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.save_submission(uuid, jsonb, text)
  from public, anon;
revoke all on function public.review_submission(uuid, numeric, text)
  from public, anon;
grant execute on function public.save_submission(uuid, jsonb, text)
  to authenticated;
grant execute on function public.review_submission(uuid, numeric, text)
  to authenticated;

-- ============================================================
-- ADMIN-ONLY TEACHER APPROVAL
-- ============================================================
create or replace function public.approve_teacher(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.profiles
  set teacher_approved = true
  where id = target_user_id and role = 'teacher';

  if not found then
    raise exception 'Teacher profile not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.revoke_teacher_approval(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  update public.profiles
  set teacher_approved = false
  where id = target_user_id and role = 'teacher';

  if not found then
    raise exception 'Teacher profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.approve_teacher(uuid) from public, anon;
revoke all on function public.revoke_teacher_approval(uuid) from public, anon;
grant execute on function public.approve_teacher(uuid) to authenticated;
grant execute on function public.revoke_teacher_approval(uuid) to authenticated;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_tasks_user on public.tasks(user_id);
create index if not exists idx_classes_teacher on public.classes(teacher_id);
create index if not exists idx_class_members_student on public.class_members(student_id);
create index if not exists idx_assignments_teacher on public.assignments(teacher_id);
create index if not exists idx_assignments_class on public.assignments(class_id);
create index if not exists idx_submissions_student on public.submissions(student_id);
create index if not exists idx_submissions_assignment on public.submissions(assignment_id);
create index if not exists idx_quiz_results_user on public.quiz_results(user_id);

commit;

-- ============================================================
-- VERIFY AFTER SUCCESS
-- ============================================================
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- FIRST ADMIN BOOTSTRAP (RUN SEPARATELY AFTER VERIFYING YOUR UUID):
-- update public.profiles
-- set role = 'admin', teacher_approved = false
-- where id = 'YOUR-REAL-AUTH-USER-UUID'::uuid
-- returning id, role, teacher_approved;
