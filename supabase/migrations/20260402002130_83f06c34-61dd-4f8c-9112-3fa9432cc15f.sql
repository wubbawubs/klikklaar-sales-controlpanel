DELETE FROM suppressed_emails WHERE email = 'support@onerooted.nl';
UPDATE email_unsubscribe_tokens SET used_at = NULL WHERE email = 'support@onerooted.nl';