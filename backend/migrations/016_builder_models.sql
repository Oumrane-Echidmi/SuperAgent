-- Pin each queued turn's model so later UI/configuration changes cannot alter it.
ALTER TABLE builder_chat_turns ADD COLUMN requested_model text
  CHECK (requested_model IS NULL OR requested_model ~ '^[a-zA-Z0-9._:-]{1,120}$');
