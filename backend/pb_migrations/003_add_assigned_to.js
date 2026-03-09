/// <reference path="../pb_data/types.d.ts" />
// Adds the optional `assigned_to` relation field to the vulnerabilities
// collection, pointing to the built-in users auth collection.
// Runs after 002_api_rules.js. Existing records will have assigned_to = null.

migrate((app) => {

  const vulns = app.findCollectionByNameOrId("vulnerabilities");

  vulns.fields.addAt(vulns.fields.length, new Field({
    type:          "relation",
    id:            "relation_vuln_assigned_to",
    name:          "assigned_to",
    required:      false,
    system:        false,
    hidden:        false,
    presentable:   false,
    collectionId:  "_pb_users_auth_",
    maxSelect:     1,
    minSelect:     0,
    cascadeDelete: false,
  }));

  app.save(vulns);

}, (app) => {

  const vulns = app.findCollectionByNameOrId("vulnerabilities");
  vulns.fields.removeById("relation_vuln_assigned_to");
  app.save(vulns);

});
