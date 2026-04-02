INSERT INTO sales_executives (first_name, last_name, email, employment_type, status)
VALUES ('Test', 'Onboarding', 'support@onerooted.nl', 'commission', 'active')
RETURNING id;