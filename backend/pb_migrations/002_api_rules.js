/// <reference path="../pb_data/types.d.ts" />
// Applies the multi-tenant API rules to the users collection.
// Runs after 001_initial_schema.js so the `organization` relation field is
// guaranteed to be committed and recognized by the rule validator.
migrate((app) => {

  // users
  const users = app.findCollectionByNameOrId("users");
  users.listRule   = "@request.auth.id != ''";
  users.viewRule   = "@request.auth.id != ''";
  users.updateRule = "@request.auth.id != '' && id = @request.auth.id";
  app.save(users);

  // groups
  const groups = app.findCollectionByNameOrId("groups");
  groups.listRule   = "@request.auth.id != ''";
  groups.viewRule   = "@request.auth.id != ''";
  groups.createRule = "@request.auth.id != ''";
  groups.updateRule = "@request.auth.id != ''";
  groups.deleteRule = "@request.auth.id != ''";
  app.save(groups);

  // vulnerabilities
  const vulnerabilities = app.findCollectionByNameOrId("vulnerabilities");
  vulnerabilities.listRule   = "@request.auth.id != ''";
  vulnerabilities.viewRule   = "@request.auth.id != ''";
  vulnerabilities.createRule = "@request.auth.id != ''";
  vulnerabilities.updateRule = "@request.auth.id != ''";
  vulnerabilities.deleteRule = "@request.auth.id != ''";
  app.save(vulnerabilities);

  // vulnerability_audit_log
  const vulnAudit = app.findCollectionByNameOrId("vulnerability_audit_log");
  vulnAudit.listRule   = "@request.auth.id != ''";
  vulnAudit.viewRule   = "@request.auth.id != ''";
  vulnAudit.createRule = "@request.auth.id != ''";
  vulnAudit.updateRule = null;
  vulnAudit.deleteRule = null;
  app.save(vulnAudit);

  // access_audit_log
  const accessAudit = app.findCollectionByNameOrId("access_audit_log");
  accessAudit.listRule   = "@request.auth.id != ''";
  accessAudit.viewRule   = "@request.auth.id != ''";
  accessAudit.createRule = "@request.auth.id != ''";
  accessAudit.updateRule = null;
  accessAudit.deleteRule = null;
  app.save(accessAudit);

  // scoring_weights
  const weights = app.findCollectionByNameOrId("scoring_weights");
  weights.listRule   = "@request.auth.id != ''";
  weights.viewRule   = "@request.auth.id != ''";
  weights.createRule = "@request.auth.id != ''";
  weights.updateRule = "@request.auth.id != ''";
  weights.deleteRule = null;
  app.save(weights);

}, (app) => {
  const collections = ["users", "groups", "vulnerabilities", "vulnerability_audit_log", "access_audit_log", "scoring_weights"];
  for (const name of collections) {
    try {
      const c = app.findCollectionByNameOrId(name);
      c.listRule   = null;
      c.viewRule   = null;
      c.createRule = null;
      c.updateRule = null;
      c.deleteRule = null;
      app.save(c);
    } catch (_) {}
  }
});