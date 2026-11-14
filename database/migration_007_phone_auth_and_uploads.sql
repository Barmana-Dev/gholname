USE regbroker;

-- Public registration and login are mobile-first. Existing back-office email
-- accounts remain valid, while new public accounts may omit email entirely.
ALTER TABLE users
  MODIFY COLUMN email VARCHAR(190) NULL;
