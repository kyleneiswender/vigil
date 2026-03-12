/// <reference path="../pb_data/types.d.ts" />
//
// v0.8.0 — CISA KEV integration schema changes.
//
// Vulnerabilities:
//   isKev (bool)        — true when this CVE appears in the CISA KEV catalog
//   kevDateAdded (date) — the date CISA added this CVE to the catalog
//
// Vulnerability audit log:
//   system_generated (bool) — true when the entry was written by an automated
//                             process (e.g. KEV sync), not a direct user action
//
// Org settings:
//   lastKevSync (date)  — timestamp of the last KEV feed sync for this org

migrate((app) => {

  // ── vulnerabilities: isKev + kevDateAdded ────────────────────────────────

  const vulnerabilities = app.findCollectionByNameOrId('vulnerabilities');

  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type:        'bool',
    id:          'bool_vuln_is_kev',
    name:        'isKev',
    required:    false,
    system:      false,
    hidden:      false,
    presentable: false,
  }));

  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type:        'date',
    id:          'date_vuln_kev_date_added',
    name:        'kevDateAdded',
    required:    false,
    system:      false,
    hidden:      false,
    presentable: false,
  }));

  app.save(vulnerabilities);

  // ── vulnerability_audit_log: system_generated ────────────────────────────

  const vulnAudit = app.findCollectionByNameOrId('vulnerability_audit_log');

  vulnAudit.fields.addAt(vulnAudit.fields.length, new Field({
    type:        'bool',
    id:          'bool_val_system_generated',
    name:        'system_generated',
    required:    false,
    system:      false,
    hidden:      false,
    presentable: false,
  }));

  app.save(vulnAudit);

  // ── org_settings: lastKevSync ────────────────────────────────────────────

  const orgSettings = app.findCollectionByNameOrId('org_settings');

  orgSettings.fields.addAt(orgSettings.fields.length, new Field({
    type:        'date',
    id:          'date_orgsettings_last_kev_sync',
    name:        'lastKevSync',
    required:    false,
    system:      false,
    hidden:      false,
    presentable: false,
  }));

  app.save(orgSettings);

}, (app) => {

  const vulnerabilities = app.findCollectionByNameOrId('vulnerabilities');
  vulnerabilities.fields.removeByName('isKev');
  vulnerabilities.fields.removeByName('kevDateAdded');
  app.save(vulnerabilities);

  const vulnAudit = app.findCollectionByNameOrId('vulnerability_audit_log');
  vulnAudit.fields.removeByName('system_generated');
  app.save(vulnAudit);

  const orgSettings = app.findCollectionByNameOrId('org_settings');
  orgSettings.fields.removeByName('lastKevSync');
  app.save(orgSettings);

});
