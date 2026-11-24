-- playerId layer and link codes. Only the Edge Functions (service role) touch
-- these tables: RLS is on with no policies, so the public anon key gets nothing.

-- One row per PlayFab account. Community data references players.id.
create table public.players (
  id           uuid primary key default gen_random_uuid(),
  playfab_id   text not null unique,
  display_name text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- One-time codes shown in the game and typed on the website. Only a hash of
-- the code is stored.
create table public.link_codes (
  code_hash  text primary key,
  player_id  uuid not null references public.players(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index link_codes_player_idx on public.link_codes (player_id);

-- Browsers signed in through a link code. Only a hash of the token is stored.
create table public.web_devices (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index web_devices_player_idx on public.web_devices (player_id);

-- Failed link-code attempts per hashed IP, for rate limiting. Rows older than
-- a day are deleted by the link-redeem function.
create table public.link_attempts (
  id      bigint generated always as identity primary key,
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index link_attempts_ip_idx on public.link_attempts (ip_hash, at);

alter table public.players       enable row level security;
alter table public.link_codes    enable row level security;
alter table public.web_devices   enable row level security;
alter table public.link_attempts enable row level security;

revoke all on public.players, public.link_codes, public.web_devices, public.link_attempts from anon, authenticated;
