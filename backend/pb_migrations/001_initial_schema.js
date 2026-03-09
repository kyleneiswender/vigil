/// <reference path="../pb_data/types.d.ts" />
//
// Initial schema for the Vulnerability Prioritization Tool.
//
// Compatible with PocketBase v0.36.x — uses the generic `new Field({ type, … })`
// constructor and `fields.addAt()` instead of the older typed constructors
// (TextField, NumberField, etc.) which are silently ignored when passed inside
// the Collection constructor.

migrate((app) => {

  // ── 1. organizations ──────────────────────────────────────────────────────

  const organizations = new Collection({
    name:       "organizations",
    type:       "base",
    listRule:   "@request.auth.id != ''",
    viewRule:   "@request.auth.id != ''",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  organizations.fields.addAt(organizations.fields.length, new Field({
    type: "text", id: "text_org_name", name: "name",
    required: true, system: false, hidden: false, presentable: true,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));
  organizations.fields.addAt(organizations.fields.length, new Field({
    type: "text", id: "text_org_domain", name: "domain",
    required: false, system: false, hidden: false, presentable: false,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));

  app.save(organizations);

  // ── 2. Extend built-in users with organization + role ─────────────────────

  const users = app.findCollectionByNameOrId("users");

  users.fields.addAt(users.fields.length, new Field({
    type: "relation", id: "relation_user_org", name: "organization",
    required: false, system: false, hidden: false, presentable: false,
    collectionId: organizations.id, maxSelect: 1, minSelect: 0, cascadeDelete: false,
  }));
  users.fields.addAt(users.fields.length, new Field({
    type: "text", id: "text_user_role", name: "role",
    required: false, system: false, hidden: false, presentable: false,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));

  // Basic rules — tightened in 002_api_rules.js after the organization
  // relation field is fully committed and recognized by the rule validator.
  users.listRule   = "";
  users.viewRule   = "";
  users.updateRule = "";
  app.save(users);

  // ── 3. groups ─────────────────────────────────────────────────────────────

  const groups = new Collection({
    name:       "groups",
    type:       "base",
    listRule:   null,
    viewRule:   null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  groups.fields.addAt(groups.fields.length, new Field({
    type: "text", id: "text_group_name", name: "name",
    required: true, system: false, hidden: false, presentable: true,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));
  groups.fields.addAt(groups.fields.length, new Field({
    type: "relation", id: "relation_group_org", name: "organization",
    required: true, system: false, hidden: false, presentable: false,
    collectionId: organizations.id, maxSelect: 1, minSelect: 0, cascadeDelete: false,
  }));
  groups.fields.addAt(groups.fields.length, new Field({
    type: "text", id: "text_group_desc", name: "description",
    required: false, system: false, hidden: false, presentable: false,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));

  app.save(groups);

  // ── 4. vulnerabilities ────────────────────────────────────────────────────

  const vulnerabilities = new Collection({
    name:       "vulnerabilities",
    type:       "base",
    listRule:   null,
    viewRule:   null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "text", id: "text_vuln_cveId", name: "cveId",
    required: true, system: false, hidden: false, presentable: true,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "^CVE-\\d{4}-\\d{4,}$",
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "text", id: "text_vuln_title", name: "title",
    required: false, system: false, hidden: false, presentable: false,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "number", id: "number_vuln_cvss", name: "cvssScore",
    required: true, system: false, hidden: false, presentable: false,
    min: 0, max: 10, onlyInt: false,
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "select", id: "select_vuln_criticality", name: "assetCriticality",
    required: true, system: false, hidden: false, presentable: false,
    values: ["Low", "Medium", "High", "Critical"], maxSelect: 1,
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "bool", id: "bool_vuln_internetFacing", name: "internetFacing",
    required: false, system: false, hidden: false, presentable: false,
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "select", id: "select_vuln_exploitability", name: "exploitability",
    required: true, system: false, hidden: false, presentable: false,
    values: ["Theoretical", "PoC", "Actively Exploited"], maxSelect: 1,
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "number", id: "number_vuln_days", name: "daysSinceDiscovery",
    required: false, system: false, hidden: false, presentable: false,
    min: 0, max: 36500, onlyInt: false,
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "number", id: "number_vuln_assets", name: "affectedAssetCount",
    required: false, system: false, hidden: false, presentable: false,
    min: 0, max: 100000, onlyInt: false,
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "number", id: "number_vuln_score", name: "compositeScore",
    required: false, system: false, hidden: false, presentable: false,
    min: 0, max: 100, onlyInt: false,
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "text", id: "text_vuln_riskTier", name: "riskTier",
    required: false, system: false, hidden: false, presentable: false,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "relation", id: "relation_vuln_org", name: "organization",
    required: true, system: false, hidden: false, presentable: false,
    collectionId: organizations.id, maxSelect: 1, minSelect: 0, cascadeDelete: false,
  }));
  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type: "relation", id: "relation_vuln_group", name: "group",
    required: false, system: false, hidden: false, presentable: false,
    collectionId: groups.id, maxSelect: 1, minSelect: 0, cascadeDelete: false,
  }));

  app.save(vulnerabilities);

  // ── 5. vulnerability_audit_log ────────────────────────────────────────────

  const usersId = app.findCollectionByNameOrId("users").id;

  const vulnAuditLog = new Collection({
    name:       "vulnerability_audit_log",
    type:       "base",
    listRule:   null,
    viewRule:   null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  vulnAuditLog.fields.addAt(vulnAuditLog.fields.length, new Field({
    type: "relation", id: "relation_val_vuln", name: "vulnerability",
    required: true, system: false, hidden: false, presentable: false,
    collectionId: vulnerabilities.id, maxSelect: 1, minSelect: 0, cascadeDelete: true,
  }));
  vulnAuditLog.fields.addAt(vulnAuditLog.fields.length, new Field({
    type: "relation", id: "relation_val_user", name: "user",
    required: true, system: false, hidden: false, presentable: false,
    collectionId: usersId, maxSelect: 1, minSelect: 0, cascadeDelete: false,
  }));
  vulnAuditLog.fields.addAt(vulnAuditLog.fields.length, new Field({
    type: "relation", id: "relation_val_org", name: "organization",
    required: true, system: false, hidden: false, presentable: false,
    collectionId: organizations.id, maxSelect: 1, minSelect: 0, cascadeDelete: false,
  }));
  vulnAuditLog.fields.addAt(vulnAuditLog.fields.length, new Field({
    type: "select", id: "select_val_action", name: "action",
    required: true, system: false, hidden: false, presentable: true,
    values: ["create", "update", "delete"], maxSelect: 1,
  }));
  vulnAuditLog.fields.addAt(vulnAuditLog.fields.length, new Field({
    type: "json", id: "json_val_changed", name: "changed_fields",
    required: false, system: false, hidden: false, presentable: false,
    maxSize: 0,
  }));
  vulnAuditLog.fields.addAt(vulnAuditLog.fields.length, new Field({
    type: "json", id: "json_val_prev", name: "previous_values",
    required: false, system: false, hidden: false, presentable: false,
    maxSize: 0,
  }));
  vulnAuditLog.fields.addAt(vulnAuditLog.fields.length, new Field({
    type: "json", id: "json_val_new", name: "new_values",
    required: false, system: false, hidden: false, presentable: false,
    maxSize: 0,
  }));

  app.save(vulnAuditLog);

  // ── 6. access_audit_log ───────────────────────────────────────────────────

  const accessAuditLog = new Collection({
    name:       "access_audit_log",
    type:       "base",
    listRule:   null,
    viewRule:   null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  accessAuditLog.fields.addAt(accessAuditLog.fields.length, new Field({
    type: "relation", id: "relation_aal_user", name: "user",
    required: true, system: false, hidden: false, presentable: false,
    collectionId: usersId, maxSelect: 1, minSelect: 0, cascadeDelete: false,
  }));
  accessAuditLog.fields.addAt(accessAuditLog.fields.length, new Field({
    type: "relation", id: "relation_aal_org", name: "organization",
    required: true, system: false, hidden: false, presentable: false,
    collectionId: organizations.id, maxSelect: 1, minSelect: 0, cascadeDelete: false,
  }));
  accessAuditLog.fields.addAt(accessAuditLog.fields.length, new Field({
    type: "text", id: "text_aal_action", name: "action",
    required: true, system: false, hidden: false, presentable: true,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));
  accessAuditLog.fields.addAt(accessAuditLog.fields.length, new Field({
    type: "text", id: "text_aal_restype", name: "resource_type",
    required: false, system: false, hidden: false, presentable: false,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));
  accessAuditLog.fields.addAt(accessAuditLog.fields.length, new Field({
    type: "text", id: "text_aal_resid", name: "resource_id",
    required: false, system: false, hidden: false, presentable: false,
    primaryKey: false, autogeneratePattern: "", min: 0, max: 0, pattern: "",
  }));
  accessAuditLog.fields.addAt(accessAuditLog.fields.length, new Field({
    type: "json", id: "json_aal_details", name: "details",
    required: false, system: false, hidden: false, presentable: false,
    maxSize: 0,
  }));

  app.save(accessAuditLog);

  // ── 7. scoring_weights ────────────────────────────────────────────────────

  const scoringWeights = new Collection({
    name:       "scoring_weights",
    type:       "base",
    listRule:   null,
    viewRule:   null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  scoringWeights.fields.addAt(scoringWeights.fields.length, new Field({
    type: "relation", id: "relation_sw_org", name: "organization",
    required: true, system: false, hidden: false, presentable: false,
    collectionId: organizations.id, maxSelect: 1, minSelect: 0, cascadeDelete: false,
  }));
  scoringWeights.fields.addAt(scoringWeights.fields.length, new Field({
    type: "number", id: "number_sw_cvss", name: "cvss",
    required: true, system: false, hidden: false, presentable: false,
    min: 0, max: 100, onlyInt: false,
  }));
  scoringWeights.fields.addAt(scoringWeights.fields.length, new Field({
    type: "number", id: "number_sw_crit", name: "criticality",
    required: true, system: false, hidden: false, presentable: false,
    min: 0, max: 100, onlyInt: false,
  }));
  scoringWeights.fields.addAt(scoringWeights.fields.length, new Field({
    type: "number", id: "number_sw_assets", name: "assetCount",
    required: true, system: false, hidden: false, presentable: false,
    min: 0, max: 100, onlyInt: false,
  }));
  scoringWeights.fields.addAt(scoringWeights.fields.length, new Field({
    type: "number", id: "number_sw_exposure", name: "exposure",
    required: true, system: false, hidden: false, presentable: false,
    min: 0, max: 100, onlyInt: false,
  }));
  scoringWeights.fields.addAt(scoringWeights.fields.length, new Field({
    type: "number", id: "number_sw_exploit", name: "exploitability",
    required: true, system: false, hidden: false, presentable: false,
    min: 0, max: 100, onlyInt: false,
  }));
  scoringWeights.fields.addAt(scoringWeights.fields.length, new Field({
    type: "number", id: "number_sw_days", name: "days",
    required: true, system: false, hidden: false, presentable: false,
    min: 0, max: 100, onlyInt: false,
  }));

  app.save(scoringWeights);

}, (app) => {

  // ── Rollback: delete in reverse dependency order ──────────────────────────

  const toDelete = [
    "scoring_weights",
    "access_audit_log",
    "vulnerability_audit_log",
    "vulnerabilities",
    "groups",
  ];

  for (const name of toDelete) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) { /* already gone */ }
  }

  // Remove added fields from users
  try {
    const users = app.findCollectionByNameOrId("users");
    users.fields.removeById("relation_user_org");
    users.fields.removeById("text_user_role");
    app.save(users);
  } catch (_) { /* ignore */ }

  // Delete organizations last (others referenced it)
  try {
    app.delete(app.findCollectionByNameOrId("organizations"));
  } catch (_) { /* already gone */ }

});
