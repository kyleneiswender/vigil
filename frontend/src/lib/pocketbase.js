import PocketBase from 'pocketbase';

// Singleton PocketBase client — import `pb` wherever you need the SDK.
export const pb = new PocketBase('http://localhost:8090');

/** Returns the currently authenticated user record, or null. */
export function getCurrentUser() {
  return pb.authStore.model;
}

/** Returns true when the auth token is present and not expired. */
export function isAuthenticated() {
  return pb.authStore.isValid;
}

/** Clears the auth token and logs the user out. */
export function logout() {
  pb.authStore.clear();
}
