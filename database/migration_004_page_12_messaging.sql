ALTER TABLE messages
  MODIFY COLUMN message_type ENUM(
    'system',
    'support',
    'deficiency',
    'deadline',
    'document_receipt',
    'payment',
    'general'
  ) NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_messages_application_created
  ON messages (application_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assignments_expert_active
  ON assignments (expert_id, application_id, completed_at);
