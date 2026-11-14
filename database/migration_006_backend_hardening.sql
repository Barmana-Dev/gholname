USE regbroker;

/* Query paths used by duplicate detection, access checks, audit review and
   the registry/operations dashboards. All statements are idempotent so this
   file is safe to apply to an existing XAMPP database. */
ALTER TABLE applications
  ADD INDEX IF NOT EXISTS idx_applications_duplicate (applicant_id,service_id,created_at,status);

ALTER TABLE documents
  ADD INDEX IF NOT EXISTS idx_documents_application_active (application_id,document_type,deleted_at,version);

ALTER TABLE assignments
  ADD INDEX IF NOT EXISTS idx_assignments_application_active (application_id,expert_id,completed_at);

ALTER TABLE status_history
  ADD INDEX IF NOT EXISTS idx_status_history_application_status (application_id,to_status,created_at);

ALTER TABLE audit_logs
  ADD INDEX IF NOT EXISTS idx_audit_actor_action_time (actor_id,action,created_at);

ALTER TABLE api_logs
  ADD INDEX IF NOT EXISTS idx_api_logs_service_time (service_code,created_at,outcome);

ALTER TABLE support_tickets
  ADD INDEX IF NOT EXISTS idx_tickets_application_status (application_id,status,assigned_to,updated_at);

ALTER TABLE review_approvals
  ADD INDEX IF NOT EXISTS idx_review_approvals_report_decision (report_id,decision);
