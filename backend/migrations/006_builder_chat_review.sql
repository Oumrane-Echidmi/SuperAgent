CREATE POLICY chat_gap_admin_read ON builder_chat_turns FOR SELECT TO superagent_app
  USING (status = 'SUCCEEDED' AND result->>'status' = 'UNSUPPORTED' AND EXISTS (SELECT 1 FROM platform_admins));
