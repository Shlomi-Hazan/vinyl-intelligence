-- Milestone 9: the AI curator makes two runtime model calls per successful
-- request - structured intent extraction and grounded selection/explanation -
-- so it records two new model_calls features. Widen the feature allow-list.
--
-- This is the only Milestone 9 schema change. No new table, grant, RLS policy,
-- index, or service_role privilege. model_calls stays: authenticated own-row
-- SELECT, service_role INSERT-only, anon none.

alter table public.model_calls
  drop constraint model_calls_feature_allowed,
  add constraint model_calls_feature_allowed
    check (feature in ('cover_vision', 'curator_intent', 'curator_selection'));
