/// <reference path="../pb_data/types.d.ts" />

// Migration 012 — add risk tier thresholds + default scoring weights to org_settings
//
// Adds 10 optional number fields to the existing org_settings collection:
//   criticalThreshold, highThreshold, mediumThreshold  — tier boundary min-scores
//   defaultWeightCvss … defaultWeightDays              — 7-factor org default weights
//
// All fields are optional (null = use hardcoded defaults). This ensures existing
// installs with no values set work correctly without data migration.

migrate((app) => {
  const collection = app.findCollectionByNameOrId('org_settings');

  const fields = [
    { name: 'criticalThreshold',          min: 1,   max: 99  },
    { name: 'highThreshold',              min: 1,   max: 99  },
    { name: 'mediumThreshold',            min: 1,   max: 99  },
    { name: 'defaultWeightCvss',          min: 0,   max: 100 },
    { name: 'defaultWeightCriticality',   min: 0,   max: 100 },
    { name: 'defaultWeightAssetCount',    min: 0,   max: 100 },
    { name: 'defaultWeightExposure',      min: 0,   max: 100 },
    { name: 'defaultWeightExploitability',min: 0,   max: 100 },
    { name: 'defaultWeightEpss',          min: 0,   max: 100 },
    { name: 'defaultWeightDays',          min: 0,   max: 100 },
  ];

  fields.forEach((f) => {
    collection.fields.addAt(collection.fields.length, new Field({
      type:         'number',
      name:         f.name,
      required:     false,
      system:       false,
      hidden:       false,
      presentable:  false,
      min:          f.min,
      max:          f.max,
    }));
  });

  app.save(collection);

}, (app) => {
  const collection = app.findCollectionByNameOrId('org_settings');

  const names = [
    'criticalThreshold', 'highThreshold', 'mediumThreshold',
    'defaultWeightCvss', 'defaultWeightCriticality', 'defaultWeightAssetCount',
    'defaultWeightExposure', 'defaultWeightExploitability', 'defaultWeightEpss',
    'defaultWeightDays',
  ];

  names.forEach((name) => {
    const field = collection.fields.getByName(name);
    if (field) collection.fields.remove(field.id);
  });

  app.save(collection);
});
