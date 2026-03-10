/// <reference path="../pb_data/types.d.ts" />
//
// Creates the org_settings collection for per-organization configuration.
// v0.7.0: stores the NVD API key used to increase NVD rate limits.
// Future sprints will add EPSS, KEV, and RSS feed settings to this collection.

migrate((app) => {
  const orgs = app.findCollectionByNameOrId("organizations");

  const orgSettings = new Collection({
    name:       "org_settings",
    type:       "base",
    listRule:   "@request.auth.id != ''",
    viewRule:   "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: null,
  });

  orgSettings.fields.addAt(orgSettings.fields.length, new Field({
    type:          "relation",
    id:            "relation_orgsettings_org",
    name:          "organization",
    required:      true,
    system:        false,
    hidden:        false,
    presentable:   false,
    collectionId:  orgs.id,
    maxSelect:     1,
    minSelect:     1,
    cascadeDelete: true,
  }));

  orgSettings.fields.addAt(orgSettings.fields.length, new Field({
    type:                "text",
    id:                  "text_orgsettings_nvd_key",
    name:                "nvd_api_key",
    required:            false,
    system:              false,
    hidden:              false,
    presentable:         false,
    primaryKey:          false,
    autogeneratePattern: "",
    min:                 0,
    max:                 0,
    pattern:             "",
  }));

  app.save(orgSettings);

}, (app) => {
  app.delete(app.findCollectionByNameOrId("org_settings"));
});
