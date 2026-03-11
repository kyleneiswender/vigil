/// <reference path="../pb_data/types.d.ts" />
//
// Adds epssScore and epssPercentile fields to the vulnerabilities collection.
// v0.7.1: informational fields only — not yet part of composite scoring (v0.7.3).
// Values will be populated by the EPSS API lookup added in v0.7.2.
//
// NOTE: fields.addAt(index, field) — index first, field second.
// The user-visible spec had the arguments reversed; this matches the PB v0.36 API
// as used in all previous migrations (001–006).

migrate((app) => {
  const vulnerabilities = app.findCollectionByNameOrId('vulnerabilities');

  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type:     'number',
    id:       'number_vuln_epss_score',
    name:     'epssScore',
    required: false,
    system:   false,
    hidden:   false,
    min:      0,
    max:      1,
  }));

  vulnerabilities.fields.addAt(vulnerabilities.fields.length, new Field({
    type:     'number',
    id:       'number_vuln_epss_percentile',
    name:     'epssPercentile',
    required: false,
    system:   false,
    hidden:   false,
    min:      0,
    max:      1,
  }));

  app.save(vulnerabilities);

}, (app) => {
  const vulnerabilities = app.findCollectionByNameOrId('vulnerabilities');
  vulnerabilities.fields.removeByName('epssScore');
  vulnerabilities.fields.removeByName('epssPercentile');
  app.save(vulnerabilities);
});
