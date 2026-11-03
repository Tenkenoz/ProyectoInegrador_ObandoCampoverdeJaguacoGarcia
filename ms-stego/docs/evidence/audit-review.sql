BEGIN READ ONLY;

SELECT analysis_id, user_id, sha256, technique, status, action, created_at,
       quarantine_state, quarantine_expires_at, quarantine_deleted_at
FROM analyses
WHERE analysis_id = :'analysis_id'::uuid;

SELECT created_at, request_id, subject_id, resource_id, event, action,
       outcome, http_status, details
FROM audit_events
WHERE resource_id = :'analysis_id'::uuid
   OR request_id IN (
     SELECT request_id
     FROM audit_events
     WHERE resource_id = :'analysis_id'::uuid
   )
ORDER BY created_at, id;

COMMIT;
