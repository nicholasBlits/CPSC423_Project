-- Profile fields: 18+ confirmation (self-declared, recorded when an account
-- is linked or signed in) and display-name change tracking.
alter table public.players
  add column age_confirmed_at        timestamptz,
  add column age_policy_version      text,
  add column display_name_changed_at timestamptz;
