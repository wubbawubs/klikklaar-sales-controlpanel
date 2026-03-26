
-- Delete related data for test SEs
DELETE FROM pipedrive_activities WHERE sales_executive_id IN ('0b1a6ffd-5a95-44b9-bac1-8c26e5c87cbc', '6b96ead0-3f32-40a8-8428-77252c18edb9');
DELETE FROM pipedrive_lead_assignments WHERE sales_executive_id IN ('0b1a6ffd-5a95-44b9-bac1-8c26e5c87cbc', '6b96ead0-3f32-40a8-8428-77252c18edb9');
DELETE FROM eod_submissions WHERE sales_executive_id IN ('0b1a6ffd-5a95-44b9-bac1-8c26e5c87cbc', '6b96ead0-3f32-40a8-8428-77252c18edb9');

-- Delete workspaces (and cascading data)
DELETE FROM generated_artifacts WHERE workspace_id IN (SELECT id FROM workspaces WHERE sales_executive_id IN ('0b1a6ffd-5a95-44b9-bac1-8c26e5c87cbc', '6b96ead0-3f32-40a8-8428-77252c18edb9'));
DELETE FROM integration_configs WHERE workspace_id IN (SELECT id FROM workspaces WHERE sales_executive_id IN ('0b1a6ffd-5a95-44b9-bac1-8c26e5c87cbc', '6b96ead0-3f32-40a8-8428-77252c18edb9'));
DELETE FROM provisioning_jobs WHERE workspace_id IN (SELECT id FROM workspaces WHERE sales_executive_id IN ('0b1a6ffd-5a95-44b9-bac1-8c26e5c87cbc', '6b96ead0-3f32-40a8-8428-77252c18edb9'));
DELETE FROM workspaces WHERE sales_executive_id IN ('0b1a6ffd-5a95-44b9-bac1-8c26e5c87cbc', '6b96ead0-3f32-40a8-8428-77252c18edb9');

-- Delete the test SEs
DELETE FROM sales_executives WHERE id IN ('0b1a6ffd-5a95-44b9-bac1-8c26e5c87cbc', '6b96ead0-3f32-40a8-8428-77252c18edb9');
