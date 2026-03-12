/// <reference path="../pb_data/types.d.ts" />
//
// v0.8.1 — Intelligence feed schema changes.
//
// rss_feeds collection:
//   organization:       relation → organizations (required, cascade delete)
//   name:               text (required, display name e.g. 'CISA Alerts')
//   url:                text (required, feed URL)
//   enabled:            bool (true = include in feed refresh)
//   lastFetched:        date (custom field — NOT the built-in created/updated per v0.36 gotcha)
//   lastFetchedStatus:  text ('ok' | 'error' | 'timeout')
//   displayOrder:       number (optional sort key)
//
// org_settings additions:
//   defaultFeedsSeeded: bool (true once the three default feeds have been created)

migrate((app) => {

  // ── rss_feeds collection ─────────────────────────────────────────────────────

  const orgs = app.findCollectionByNameOrId('organizations');

  const rssFeeds = new Collection({
    name:       'rss_feeds',
    type:       'base',
    listRule:   "@request.auth.id != ''",
    viewRule:   "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.id != ''",
  });

  rssFeeds.fields.addAt(rssFeeds.fields.length, new Field({
    type:         'relation',
    id:           'relation_rssfeeds_org',
    name:         'organization',
    required:     true,
    system:       false,
    hidden:       false,
    presentable:  false,
    collectionId: orgs.id,
    maxSelect:    1,
    minSelect:    1,
    cascadeDelete: true,
  }));

  rssFeeds.fields.addAt(rssFeeds.fields.length, new Field({
    type:                 'text',
    id:                   'text_rssfeeds_name',
    name:                 'name',
    required:             true,
    system:               false,
    hidden:               false,
    presentable:          true,
    primaryKey:           false,
    autogeneratePattern:  '',
    min:                  0,
    max:                  0,
    pattern:              '',
  }));

  rssFeeds.fields.addAt(rssFeeds.fields.length, new Field({
    type:                 'text',
    id:                   'text_rssfeeds_url',
    name:                 'url',
    required:             true,
    system:               false,
    hidden:               false,
    presentable:          false,
    primaryKey:           false,
    autogeneratePattern:  '',
    min:                  0,
    max:                  0,
    pattern:              '',
  }));

  rssFeeds.fields.addAt(rssFeeds.fields.length, new Field({
    type:        'bool',
    id:          'bool_rssfeeds_enabled',
    name:        'enabled',
    required:    false,
    system:      false,
    hidden:      false,
    presentable: false,
  }));

  rssFeeds.fields.addAt(rssFeeds.fields.length, new Field({
    type:        'date',
    id:          'date_rssfeeds_last_fetched',
    name:        'lastFetched',
    required:    false,
    system:      false,
    hidden:      false,
    presentable: false,
  }));

  rssFeeds.fields.addAt(rssFeeds.fields.length, new Field({
    type:                 'text',
    id:                   'text_rssfeeds_last_fetched_status',
    name:                 'lastFetchedStatus',
    required:             false,
    system:               false,
    hidden:               false,
    presentable:          false,
    primaryKey:           false,
    autogeneratePattern:  '',
    min:                  0,
    max:                  0,
    pattern:              '',
  }));

  rssFeeds.fields.addAt(rssFeeds.fields.length, new Field({
    type:        'number',
    id:          'number_rssfeeds_display_order',
    name:        'displayOrder',
    required:    false,
    system:      false,
    hidden:      false,
    presentable: false,
    min:         null,
    max:         null,
    onlyInt:     false,
  }));

  app.save(rssFeeds);

  // ── org_settings: defaultFeedsSeeded ─────────────────────────────────────────

  const orgSettings = app.findCollectionByNameOrId('org_settings');

  orgSettings.fields.addAt(orgSettings.fields.length, new Field({
    type:        'bool',
    id:          'bool_orgsettings_default_feeds_seeded',
    name:        'defaultFeedsSeeded',
    required:    false,
    system:      false,
    hidden:      false,
    presentable: false,
  }));

  app.save(orgSettings);

}, (app) => {

  app.delete(app.findCollectionByNameOrId('rss_feeds'));

  const orgSettings = app.findCollectionByNameOrId('org_settings');
  orgSettings.fields.removeByName('defaultFeedsSeeded');
  app.save(orgSettings);

});
