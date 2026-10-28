-- The audit log is append-only: the database itself refuses edits and deletions.
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
-- Default reason codes (org_id null). Companies add their own in Settings.
INSERT INTO "reason_code" ("org_id", "code", "label", "applies") VALUES
  (NULL, 'below_bar', 'Below the bar on requirements', 'drop'),
  (NULL, 'missing_must_have', 'Missing a must-have', 'drop'),
  (NULL, 'comp_misaligned', 'Compensation misaligned', 'drop'),
  (NULL, 'notice_too_long', 'Notice period too long', 'drop'),
  (NULL, 'location', 'Location or relocation', 'drop'),
  (NULL, 'not_interested', 'Candidate not interested', 'drop'),
  (NULL, 'no_response', 'No response after follow-ups', 'drop'),
  (NULL, 'failed_verification', 'Claim did not hold up', 'drop'),
  (NULL, 'interview_feedback', 'Interview feedback', 'drop'),
  (NULL, 'someone_else', 'Another candidate was chosen', 'drop'),
  (NULL, 'duplicate', 'Duplicate application', 'drop'),
  (NULL, 'role_closed', 'Role closed or on hold', 'drop'),
  (NULL, 'other', 'Other', 'drop'),
  (NULL, 'timing', 'Timing', 'hold'),
  (NULL, 'comparing', 'Comparing with others', 'hold'),
  (NULL, 'awaiting_answer', 'Waiting on an answer', 'hold'),
  (NULL, 'strong_match', 'Strong match', 'shortlist'),
  (NULL, 'worth_a_conversation', 'Worth a conversation', 'shortlist');
