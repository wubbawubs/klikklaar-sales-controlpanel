import type { SalesExecutive, Workspace } from '@/types/database';

export const ARTIFACT_TYPES = [
  { type: 'sharepoint_manifest', name: 'SharePoint Provisioning Manifest', format: 'json' },
  { type: 'site_script', name: 'SharePoint Site Script', format: 'json' },
  { type: 'rights_plan', name: 'SharePoint Rights Plan', format: 'json' },
  { type: 'power_automate_manifest', name: 'Power Automate Flow Manifest', format: 'json' },
  { type: 'integration_config', name: 'Integratieconfiguratie', format: 'json' },
  { type: 'implementation_checklist', name: 'Implementatiechecklist', format: 'txt' },
  { type: 'deployment_summary', name: 'Deployment Samenvatting', format: 'txt' },
] as const;

export type ArtifactType = typeof ARTIFACT_TYPES[number]['type'];

function generateSharePointManifest(se: SalesExecutive, ws: Workspace) {
  return {
    generatedAt: new Date().toISOString(),
    salesExecutive: se.full_name,
    workspace: ws.workspace_name,
    siteDefinition: {
      title: ws.workspace_name,
      url: `/sites/${ws.workspace_slug}`,
      template: 'TeamSite',
      lists: ['Leads', 'Deals en abonnementen', 'Afspraken', 'Activiteiten', 'EOD Status'],
      libraries: ws.include_training_library ? ['Training en coaching'] : [],
      pages: ['Startpagina', 'Lead lijsten', 'Deals en abonnementen', 'Afspraken', 'Training en coaching', 'End of Day Typeform evaluatie'],
      navigation: ['Start', 'Lead lijsten', 'Deals en abonnementen', 'Afspraken', 'Training en coaching', 'End of Day Typeform evaluatie'],
    },
  };
}

function generateSiteScript(se: SalesExecutive, ws: Workspace) {
  return {
    '$schema': 'https://developer.microsoft.com/json-schemas/sp/site-design-script-actions.schema.json',
    generatedAt: new Date().toISOString(),
    salesExecutive: se.full_name,
    workspace: ws.workspace_name,
    actions: [
      { verb: 'createSPList', listName: 'Leads', templateType: 100 },
      { verb: 'createSPList', listName: 'Deals', templateType: 100 },
      { verb: 'createSPList', listName: 'Afspraken', templateType: 100 },
      { verb: 'createSPList', listName: 'Activiteiten', templateType: 100 },
      { verb: 'createSPList', listName: 'EOD Status', templateType: 100 },
    ],
  };
}

function generateRightsPlan(se: SalesExecutive, ws: Workspace) {
  return {
    generatedAt: new Date().toISOString(),
    salesExecutive: se.full_name,
    workspace: ws.workspace_name,
    permissions: {
      siteOwners: ['Klikklaar SEO Admins'],
      siteMembers: [se.full_name],
      siteVisitors: [],
      externalAccess: se.external_access_required,
      externalGuestEmail: se.external_guest_email,
    },
  };
}

function generatePowerAutomateManifest(se: SalesExecutive, ws: Workspace) {
  return {
    generatedAt: new Date().toISOString(),
    salesExecutive: se.full_name,
    workspace: ws.workspace_name,
    flows: [
      { name: 'SE Registratie', trigger: 'Nieuwe SE aangemaakt', actions: ['Workspace aanmaken', 'Lijsten configureren', 'Rechten toewijzen'] },
      { name: 'Leadimport', trigger: 'Excel upload', actions: ['Data valideren', 'Leads importeren', 'Status bijwerken'] },
      { name: 'EOD Intake', trigger: 'Typeform webhook', actions: ['Response opslaan', 'Notificatie sturen', 'Status bijwerken'] },
      { name: 'Foutafhandeling', trigger: 'Fout gedetecteerd', actions: ['Log aanmaken', 'Retry plannen', 'Admin notificeren'] },
    ],
  };
}

function generateIntegrationConfig(se: SalesExecutive, ws: Workspace) {
  return {
    generatedAt: new Date().toISOString(),
    salesExecutive: se.full_name,
    workspace: ws.workspace_name,
    integrations: {
      pipedrive: { enabled: false, status: 'not_configured' },
      exact: { enabled: false, status: 'not_configured' },
      qapitaal: { enabled: false, status: 'not_configured' },
      typeform: { enabled: !!ws.eod_typeform_url, url: ws.eod_typeform_url, displayMode: ws.eod_display_mode },
    },
  };
}

function generateImplementationChecklist(se: SalesExecutive, ws: Workspace): string {
  return [
    `# Implementatiechecklist - ${se.full_name}`,
    `Gegenereerd: ${new Date().toLocaleString('nl-NL')}`,
    '',
    '## SharePoint',
    `- [ ] Site "${ws.workspace_name}" aanmaken`,
    '- [ ] Lijsten configureren (Leads, Deals, Afspraken, Activiteiten, EOD)',
    ws.include_training_library ? '- [ ] Trainingsbibliotheek aanmaken' : '',
    `- [ ] Rechten toewijzen aan ${se.full_name}`,
    se.external_access_required ? `- [ ] Externe gasttoegang instellen voor ${se.external_guest_email}` : '',
    '- [ ] Navigatie configureren',
    '',
    '## Power Automate',
    '- [ ] SE Registratie flow activeren',
    '- [ ] Leadimport flow configureren',
    ws.eod_typeform_url ? '- [ ] EOD Typeform webhook instellen' : '',
    '',
    '## Integraties',
    '- [ ] Pipedrive configureren (indien van toepassing)',
    '- [ ] Exact configureren (indien van toepassing)',
    '- [ ] Qapitaal configureren (indien van toepassing)',
  ].filter(Boolean).join('\n');
}

function generateDeploymentSummary(se: SalesExecutive, ws: Workspace): string {
  return [
    `# Deployment Samenvatting - ${se.full_name}`,
    `Datum: ${new Date().toLocaleString('nl-NL')}`,
    '',
    `Sales Executive: ${se.full_name}`,
    `E-mail: ${se.email}`,
    `Workspace: ${ws.workspace_name}`,
    `Provisioning mode: ${ws.provisioning_mode}`,
    `Status: ${ws.sharepoint_status}`,
    `Productlijnen: ${ws.product_lines?.join(', ')}`,
  ].join('\n');
}

export function generateArtifactContent(type: string, se: SalesExecutive, ws: Workspace): { json: object | null; text: string | null } {
  switch (type) {
    case 'sharepoint_manifest':
      return { json: generateSharePointManifest(se, ws), text: null };
    case 'site_script':
      return { json: generateSiteScript(se, ws), text: null };
    case 'rights_plan':
      return { json: generateRightsPlan(se, ws), text: null };
    case 'power_automate_manifest':
      return { json: generatePowerAutomateManifest(se, ws), text: null };
    case 'integration_config':
      return { json: generateIntegrationConfig(se, ws), text: null };
    case 'implementation_checklist':
      return { json: null, text: generateImplementationChecklist(se, ws) };
    case 'deployment_summary':
      return { json: null, text: generateDeploymentSummary(se, ws) };
    default:
      return { json: null, text: null };
  }
}

export function buildArtifactInserts(se: SalesExecutive, ws: Workspace) {
  return ARTIFACT_TYPES.map(at => {
    const { json, text } = generateArtifactContent(at.type, se, ws);
    return {
      workspace_id: ws.id,
      artifact_type: at.type,
      artifact_name: at.name,
      artifact_format: at.format,
      artifact_content: json,
      artifact_text: text,
      version: '1.0',
    };
  });
}
