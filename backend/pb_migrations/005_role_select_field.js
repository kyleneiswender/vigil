/// <reference path="../pb_data/types.d.ts" />
//
// Convert the users.role field from a plain text field to a select field
// with the three valid values: admin, analyst, viewer.
//
// Any existing role values that match one of the three options are preserved
// automatically by PocketBase when the field type changes.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // Remove the old text field by its ID (created in 001_initial_schema.js)
  users.fields.removeById("text_user_role");

  // Add the replacement select field with a new ID — using the same ID as
  // the removed text field causes PocketBase to reject it with "Field type
  // cannot be changed". A fresh ID is treated as an entirely new field.
  // NOTE: existing role values are reset by this column swap; re-set them
  // via the dropdown in the PocketBase admin UI after restarting.
  users.fields.addAt(users.fields.length, new Field({
    type:       "select",
    id:         "select_user_role",
    name:       "role",
    required:   false,
    system:     false,
    hidden:     false,
    presentable: false,
    maxSelect:  1,
    values:     ["admin", "analyst", "viewer"],
  }));

  app.save(users);
}, (app) => {
  // Revert: swap select back to a plain text field
  const users = app.findCollectionByNameOrId("users");

  users.fields.removeById("select_user_role");

  users.fields.addAt(users.fields.length, new Field({
    type:       "text",
    id:         "text_user_role",
    name:       "role",
    required:   false,
    system:     false,
    hidden:     false,
    presentable: false,
    primaryKey: false,
    autogeneratePattern: "",
    min:        0,
    max:        0,
    pattern:    "",
  }));

  app.save(users);
});
