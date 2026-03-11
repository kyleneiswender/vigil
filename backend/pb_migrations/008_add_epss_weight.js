/// <reference path="../pb_data/types.d.ts" />

/**
 * Migration 008: Add epss field to scoring_weights collection.
 *
 * v0.7.3 introduces EPSS as a weighted scoring factor (default 10%).
 * The new integer field stores the EPSS weight alongside the existing six factors.
 *
 * Existing records will have null for this field after migration.
 * The application falls back to DEFAULT_WEIGHTS.epss (10) when the field is null.
 */
migrate((app) => {
  const weights = app.findCollectionByNameOrId('scoring_weights');

  weights.fields.addAt(weights.fields.length, new Field({
    id:       'number_weights_epss',
    type:     'number',
    name:     'epss',
    required: false,
    min:      0,
    max:      100,
  }));

  app.save(weights);
}, (app) => {
  const weights = app.findCollectionByNameOrId('scoring_weights');
  weights.fields.removeByName('epss');
  app.save(weights);
});
