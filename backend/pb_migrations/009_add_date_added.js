/// <reference path="../pb_data/types.d.ts" />
//
// Adds dateAdded autodate field to the vulnerabilities collection.
//
// Background: PocketBase v0.36 does not expose the system `created` field via
// the REST API even when explicitly requested via the `fields` query parameter.
// This custom autodate field replicates the behaviour — auto-set at record
// creation, never changed on update — using a regular (non-system) field that
// IS returned in all API responses.
//
// Existing records will have an empty value and will display "–" in the UI.
// All records created after this migration will have the field populated.

migrate((app) => {
  const vulnerabilities = app.findCollectionByNameOrId('vulnerabilities');

  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type:        'autodate',
    id:          'autodate_vuln_date_added',
    name:        'dateAdded',
    required:    false,
    system:      false,
    hidden:      false,
    presentable: false,
    onCreate:    true,
    onUpdate:    false,
  }));

  app.save(vulnerabilities);

}, (app) => {
  const vulnerabilities = app.findCollectionByNameOrId('vulnerabilities');
  vulnerabilities.fields.removeByName('dateAdded');
  app.save(vulnerabilities);
});
