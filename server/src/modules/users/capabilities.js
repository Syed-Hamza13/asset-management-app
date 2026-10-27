export const ALL_CAPABILITIES = [
  'asset_types.view_own',
  'asset_types.create_own',
  'asset_types.edit_own',
  'asset_types.delete_own',
  'assets.view_own',
  'assets.create_own',
  'assets.edit_own',
  'assets.delete_own',
  'assets.bulk_own',
  'fields.manage_own',
  'dropdowns.manage_own',
  'common_form.manage_own',
  'automations.manage_own',
  'reports.view_own',
  'reports.export_own',
  'branding.manage',
  'email.templates.manage_own',
  'email.rules.manage_own',
  'email.history.view_own',
];

// Decision: new users start with "assets only" — they can browse, add, and
// maintain their own assets but cannot touch schema/configuration until granted.
export const DEFAULT_PERMISSIONS = [
  'asset_types.view_own',
  'assets.view_own',
  'assets.create_own',
  'assets.edit_own',
  'assets.delete_own',
  'assets.bulk_own',
  'reports.view_own',
];
