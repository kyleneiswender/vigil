import { useState, useEffect } from 'react';
import { getCurrentUser } from '../lib/pocketbase.js';
import { fetchUsers, inviteUser, updateUserRole, removeUser } from '../lib/api.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ROLE_STYLES = {
  admin:   'bg-purple-100 text-purple-700',
  analyst: 'bg-blue-100 text-blue-700',
  viewer:  'bg-gray-100 text-gray-600',
};

const labelClass  = 'block text-sm font-medium text-gray-700 mb-1';
const inputClass  = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const selectClass = inputClass;

// ─── Access denied fallback ───────────────────────────────────────────────────

function AccessDenied({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
        <button type="button" onClick={onClose} aria-label="Close"
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
          <XIcon />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-6">
        <div className="text-4xl">🔒</div>
        <p className="text-base font-semibold text-gray-800">Access Denied</p>
        <p className="text-sm text-gray-500">User management requires the <strong>admin</strong> role.</p>
        <button type="button" onClick={onClose}
          className="mt-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          Go back
        </button>
      </div>
    </div>
  );
}

// ─── Invite user modal ────────────────────────────────────────────────────────

function InviteModal({ organizationId, onSuccess, onClose }) {
  const [form, setForm]   = useState({ email: '', fullName: '', role: 'analyst', password: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: null }));
  }

  function validate() {
    const next = {};
    if (!form.email.trim())             next.email    = 'Email is required';
    else if (!EMAIL_RE.test(form.email.trim())) next.email = 'Enter a valid email address';
    if (!form.password)                 next.password = 'Password is required';
    else if (form.password.length < 8)  next.password = 'Password must be at least 8 characters';
    return next;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    try {
      const record = await inviteUser(
        form.email.trim(), form.password, form.fullName.trim(),
        form.role, organizationId,
      );
      onSuccess(record.email);
    } catch (err) {
      setErrors({ submit: err?.message ?? 'Failed to create user' });
    } finally {
      setSaving(false);
    }
  }

  const errCls = 'border-red-400 focus:border-red-500 focus:ring-red-500';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">Invite New User</h3>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50">
            <XIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 px-6 py-5">
          {errors.submit && (
            <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{errors.submit}</p>
          )}

          <div>
            <label className={labelClass}>Email address <span className="text-red-500">*</span></label>
            <input name="email" type="email" value={form.email} onChange={handleChange} disabled={saving}
              className={`${inputClass} ${errors.email ? errCls : ''}`} />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>

          <div>
            <label className={labelClass}>Full name <span className="text-gray-400 font-normal">(optional)</span></label>
            <input name="fullName" type="text" value={form.fullName} onChange={handleChange} disabled={saving}
              className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Role</label>
            <select name="role" value={form.role} onChange={handleChange} disabled={saving} className={selectClass}>
              <option value="admin">Admin</option>
              <option value="analyst">Analyst</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Password <span className="text-red-500">*</span></label>
            <input name="password" type="password" value={form.password} onChange={handleChange} disabled={saving}
              className={`${inputClass} ${errors.password ? errCls : ''}`} />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
            <p className="mt-1 text-xs text-gray-400">Minimum 8 characters. Share this securely with the new user.</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
              {saving ? 'Inviting…' : 'Invite User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteModal({ userEmail, onConfirm, onClose, saving }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white shadow-xl">
        <div className="px-6 py-5 space-y-3">
          <h3 className="text-base font-semibold text-gray-900">Remove user?</h3>
          <p className="text-sm text-gray-600">
            Remove <strong className="font-medium text-gray-900">{userEmail}</strong> from your organization?
            This cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={saving}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-colors disabled:opacity-50">
            {saving ? 'Removing…' : 'Remove User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Full-page overlay for admin-only user management.
 *
 * @param {{ organizationId: string, currentUserId: string, onClose: () => void }} props
 */
export default function UserManagementPanel({ organizationId, currentUserId, onClose }) {
  const currentUser = getCurrentUser();

  const [users,          setUsers]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [successMsg,     setSuccessMsg]     = useState('');
  const [showInvite,     setShowInvite]     = useState(false);
  const [editingRoleId,  setEditingRoleId]  = useState(null);
  const [pendingRole,    setPendingRole]    = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [saving,         setSaving]         = useState(false);

  useEffect(() => {
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Access guard — must be admin
  if (currentUser?.role !== 'admin') {
    return <AccessDenied onClose={onClose} />;
  }

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const list = await fetchUsers(organizationId);
      setUsers(list);
    } catch (e) {
      setError('Failed to load users: ' + (e?.message ?? 'unknown error'));
    } finally {
      setLoading(false);
    }
  }

  function startEditRole(user) {
    setEditingRoleId(user.id);
    setPendingRole(user.role);
  }

  function cancelEditRole() {
    setEditingRoleId(null);
    setPendingRole('');
  }

  async function handleRoleSave(userId) {
    setSaving(true);
    setError('');
    try {
      await updateUserRole(userId, pendingRole, organizationId);
      setEditingRoleId(null);
      setSuccessMsg('Role updated successfully.');
      await loadUsers();
    } catch (e) {
      setError('Failed to update role: ' + (e?.message ?? 'unknown error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    setSaving(true);
    setError('');
    const targetEmail = users.find((u) => u.id === deleteTargetId)?.email ?? '';
    try {
      await removeUser(deleteTargetId, organizationId);
      setDeleteTargetId(null);
      setSuccessMsg(`${targetEmail} has been removed.`);
      await loadUsers();
    } catch (e) {
      setError('Failed to remove user: ' + (e?.message ?? 'unknown error'));
      setDeleteTargetId(null);
    } finally {
      setSaving(false);
    }
  }

  function handleInviteSuccess(email) {
    setShowInvite(false);
    setSuccessMsg(`${email} has been invited successfully.`);
    loadUsers();
  }

  const deleteTarget = users.find((u) => u.id === deleteTargetId);

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
            <p className="mt-0.5 text-sm text-gray-500">Manage users in your organization</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close panel"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
            <XIcon />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Banners */}
          {successMsg && (
            <div className="mb-4 flex items-center justify-between rounded-md bg-green-50 border border-green-200 px-4 py-2.5">
              <p className="text-sm text-green-700">{successMsg}</p>
              <button type="button" onClick={() => setSuccessMsg('')}
                className="ml-4 text-green-500 hover:text-green-700 text-lg leading-none">&times;</button>
            </div>
          )}
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-md bg-red-50 border border-red-200 px-4 py-2.5">
              <p className="text-sm text-red-700">{error}</p>
              <button type="button" onClick={() => setError('')}
                className="ml-4 text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
            </div>
          )}

          {/* Toolbar */}
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {loading ? 'Loading…' : `${users.length} ${users.length === 1 ? 'user' : 'users'} in this organization`}
            </p>
            <button type="button" onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM2.046 15.253c-.058.468.172.92.57 1.175A9.953 9.953 0 0 0 8 18c1.982 0 3.83-.578 5.384-1.573.398-.254.628-.707.57-1.175a6.001 6.001 0 0 0-11.908 0ZM14.75 7.75a.75.75 0 0 0-1.5 0v2.25H11a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H17a.75.75 0 0 0 0-1.5h-2.25V7.75Z" />
              </svg>
              Invite User
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading users…</div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No users found in this organization.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Member Since</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {users.map((user, index) => {
                    const isCurrentUser = user.id === currentUserId;
                    const isEditingRole = editingRoleId === user.id;

                    return (
                      <tr key={user.id} className={isCurrentUser ? 'bg-blue-50/50' : 'hover:bg-gray-50'}>
                        {/* Rank */}
                        <td className="px-4 py-3 text-xs text-gray-400">{index + 1}</td>

                        {/* Email */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{user.email}</span>
                            {isCurrentUser && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">You</span>
                            )}
                          </div>
                        </td>

                        {/* Name */}
                        <td className="px-4 py-3 text-gray-500">{user.name || <span className="text-gray-300">—</span>}</td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          {isEditingRole ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={pendingRole}
                                onChange={(e) => setPendingRole(e.target.value)}
                                disabled={saving}
                                className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="admin">Admin</option>
                                <option value="analyst">Analyst</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              <button type="button" onClick={() => handleRoleSave(user.id)} disabled={saving}
                                className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                {saving ? '…' : 'Save'}
                              </button>
                              <button type="button" onClick={cancelEditRole} disabled={saving}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${ROLE_STYLES[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                              {user.role || 'unknown'}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          {user.verified ? (
                            <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">Verified</span>
                          ) : (
                            <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700">Unverified</span>
                          )}
                        </td>

                        {/* Member Since */}
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {new Date(user.created).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          {!isEditingRole && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => startEditRole(user)}
                                disabled={saving}
                                title="Change role"
                                aria-label={`Edit role for ${user.email}`}
                                className="rounded p-1 text-gray-400 hover:bg-blue-100 hover:text-blue-600 transition-colors disabled:opacity-30"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => !isCurrentUser && setDeleteTargetId(user.id)}
                                disabled={saving || isCurrentUser}
                                title={isCurrentUser ? 'Cannot remove your own account' : `Remove ${user.email}`}
                                aria-label={`Remove ${user.email}`}
                                className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showInvite && (
        <InviteModal
          organizationId={organizationId}
          onSuccess={handleInviteSuccess}
          onClose={() => setShowInvite(false)}
        />
      )}

      {deleteTargetId && deleteTarget && (
        <DeleteModal
          userEmail={deleteTarget.email}
          onConfirm={handleDelete}
          onClose={() => setDeleteTargetId(null)}
          saving={saving}
        />
      )}
    </>
  );
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}
