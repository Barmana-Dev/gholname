USE regbroker;

/* Complete the auditable application lifecycle without removing legacy values.
   Existing rows keep their status; new transitions are enforced in the API
   graph and this enum prevents invalid persistence at the database boundary. */
ALTER TABLE applications
  MODIFY COLUMN status ENUM(
    'draft',
    'submitted',
    'initial_review',
    'documents_deficient',
    'awaiting_applicant',
    'completed_documents',
    'awaiting_payment',
    'paid',
    'assigned_registry_expert',
    'assigned_surveyor',
    'under_expert_review',
    'additional_action',
    'ready_to_send',
    'registry_exchange',
    'awaiting_registry',
    'registry_return_deficient',
    'correcting_registry_deficiency',
    'completed',
    'closed_incomplete',
    'out_of_scope',
    'stopped_legal_technical',
    'stopped_security',
    'cancelled_by_applicant',
    'referred_complaint'
  ) NOT NULL DEFAULT 'draft';
