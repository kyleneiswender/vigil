/// <reference path="../pb_data/types.d.ts" />
// Updates the users auth collection API rules to allow admin users to
// invite, update, and remove other users within the app.
//
// Runs after 003_add_assigned_to.js. PocketBase v0.36 supports
// @request.auth.<field> in rule expressions, so @request.auth.role
// works because `role` is a custom text field on the users collection.

migrate((app) => {

  const users = app.findCollectionByNameOrId("users");

  // Only admin users can create new accounts (invite flow).
  users.createRule = "@request.auth.role = 'admin'";

  // Admins can update any user; non-admins can only update their own record.
  users.updateRule = "@request.auth.id != '' && (@request.auth.role = 'admin' || id = @request.auth.id)";

  // Only admins can delete users, and they cannot delete their own account.
  users.deleteRule = "@request.auth.role = 'admin' && id != @request.auth.id";

  app.save(users);

}, (app) => {

  const users = app.findCollectionByNameOrId("users");
  users.createRule = null;
  users.updateRule = "@request.auth.id != '' && id = @request.auth.id";
  users.deleteRule = null;
  app.save(users);

});
