-- DMS Tech — initial schema
-- Mirrors the content model in src/content/types.ts so the admin dashboard can take
-- over content without changing any page. Bilingual text is stored as *_ar / *_en.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Leads: every quote / contact / hero / CTA / career submission (live now)
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  company     text not null default '',
  service     text not null default '',
  budget      text not null default '',
  message     text not null default '',
  source      text not null default 'quote' check (source in ('quote','contact','hero','cta','career')),
  locale      text not null default 'ar' check (locale in ('ar','en')),
  status      text not null default 'new' check (status in ('new','contacted','qualified','proposal','won','lost')),
  assigned_to uuid,
  notes       text not null default ''
);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_idx on public.leads (status);

-- ---------------------------------------------------------------------------
-- Content tables (for the dashboard phase)
-- ---------------------------------------------------------------------------
create table if not exists public.services (
  slug           text primary key,
  icon           text not null,
  image          text not null,
  eyebrow_ar     text not null, eyebrow_en     text not null,
  title_ar       text not null, title_en       text not null,
  summary_ar     text not null, summary_en     text not null,
  description_ar text not null, description_en text not null,
  highlights     jsonb not null default '[]',  -- [{ar,en}]
  features       jsonb not null default '[]',  -- [{icon,title:{ar,en},description:{ar,en}}]
  benefits       jsonb not null default '[]',  -- [{icon,label:{ar,en}}]
  sort_order     int not null default 0,
  published      boolean not null default true,
  updated_at     timestamptz not null default now()
);

create table if not exists public.posts (
  slug         text primary key,
  category_ar  text not null, category_en text not null,
  title_ar     text not null, title_en    text not null,
  excerpt_ar   text not null, excerpt_en  text not null,
  body_ar      text[] not null default '{}',
  body_en      text[] not null default '{}',
  image        text not null,
  read_minutes int not null default 3,
  published_at date not null default current_date,
  published    boolean not null default true
);

create table if not exists public.jobs (
  slug           text primary key,
  title_ar       text not null, title_en       text not null,
  team_ar        text not null, team_en        text not null,
  type_ar        text not null, type_en        text not null,
  location_ar    text not null, location_en    text not null,
  description_ar text not null, description_en text not null,
  open           boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.industries (
  slug           text primary key,
  icon           text not null,
  image          text not null,
  title_ar       text not null, title_en       text not null,
  description_ar text not null, description_en text not null,
  quote_ar       text not null, quote_en       text not null,
  sort_order     int not null default 0
);

-- key/value company settings (contact info, socials, announcement bar)
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
--   * public site: read published content only
--   * leads: insert happens server-side with the service role; no public access
--   * dashboard: authenticated staff get full access (tighten with roles later)
-- ---------------------------------------------------------------------------
alter table public.leads      enable row level security;
alter table public.services   enable row level security;
alter table public.posts      enable row level security;
alter table public.jobs       enable row level security;
alter table public.industries enable row level security;
alter table public.settings   enable row level security;

create policy "public read services"   on public.services   for select using (published);
create policy "public read posts"      on public.posts      for select using (published);
create policy "public read jobs"       on public.jobs       for select using (open);
create policy "public read industries" on public.industries for select using (true);
create policy "public read settings"   on public.settings   for select using (true);

create policy "staff all leads"      on public.leads      for all to authenticated using (true) with check (true);
create policy "staff all services"   on public.services   for all to authenticated using (true) with check (true);
create policy "staff all posts"      on public.posts      for all to authenticated using (true) with check (true);
create policy "staff all jobs"       on public.jobs       for all to authenticated using (true) with check (true);
create policy "staff all industries" on public.industries for all to authenticated using (true) with check (true);
create policy "staff all settings"   on public.settings   for all to authenticated using (true) with check (true);
