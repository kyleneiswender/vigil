/**
 * api.user.test.js
 *
 * Unit tests for the user management API functions:
 *   inviteUser, updateUserRole, removeUser
 *
 * Uses the same mock pattern as api.diagnostic.test.js:
 * vi.hoisted() + vi.mock('./pocketbase.js') + sessionStorage polyfill.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── sessionStorage polyfill (Vitest env is 'node') ──────────────────────────
const _ss = {};
global.sessionStorage = {
  getItem:    (k)    => Object.prototype.hasOwnProperty.call(_ss, k) ? _ss[k] : null,
  setItem:    (k, v) => { _ss[k] = String(v); },
  removeItem: (k)    => { delete _ss[k]; },
  clear:      ()     => { for (const k in _ss) delete _ss[k]; },
};

// ─── Hoisted mock handles ─────────────────────────────────────────────────────
const m = vi.hoisted(() => ({
  authStoreRecord:   null,
  usersCreate:       vi.fn(),
  usersGetOne:       vi.fn(),
  usersUpdate:       vi.fn(),
  usersDelete:       vi.fn(),
  accessAuditCreate: vi.fn(),
}));

vi.mock('./pocketbase.js', () => ({
  pb: {
    authStore: {
      get model() { return m.authStoreRecord; },
      isValid: true,
      onChange: vi.fn(() => () => {}),
      save: vi.fn(),
    },
    collection: vi.fn((name) => {
      switch (name) {
        case 'users':
          return {
            create:  m.usersCreate,
            getOne:  m.usersGetOne,
            update:  m.usersUpdate,
            delete:  m.usersDelete,
          };
        case 'access_audit_log':
          return { create: m.accessAuditCreate };
        default:
          return {};
      }
    }),
  },
  getCurrentUser:  () => m.authStoreRecord,
  isAuthenticated: () => !!m.authStoreRecord,
  logout: vi.fn(),
}));

import { initializeUser, inviteUser, updateUserRole, removeUser } from './api.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org_abc123';

const AUTH_USER = {
  id:           'usr_admin',
  email:        'admin@corp.com',
  organization: ORG_ID,
  role:         'admin',
};

const NEW_USER_RECORD = {
  id:           'usr_new',
  email:        'alice@corp.com',
  name:         'Alice Smith',
  role:         'analyst',
  organization: ORG_ID,
  verified:     true,
  created:      '2024-01-01T00:00:00Z',
};

const EXISTING_USER = {
  id:   'usr_existing',
  email: 'bob@corp.com',
  role: 'viewer',
};

const UPDATED_USER = { ...EXISTING_USER, role: 'analyst' };

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  global.sessionStorage.clear();
  // Reset module-level currentOrgId
  m.authStoreRecord = null;
  initializeUser();
  // Default happy-path: admin user authenticated
  m.authStoreRecord = AUTH_USER;
  m.usersCreate.mockResolvedValue(NEW_USER_RECORD);
  m.usersGetOne.mockResolvedValue(EXISTING_USER);
  m.usersUpdate.mockResolvedValue(UPDATED_USER);
  m.usersDelete.mockResolvedValue(undefined);
  m.accessAuditCreate.mockResolvedValue({ id: 'audit_001' });
});

// ─── Suite E: inviteUser() ────────────────────────────────────────────────────

describe('E — inviteUser(): creates user and writes audit log', () => {

  it('E1: creates user with correct email, role, org, password, and name', async () => {
    await inviteUser('alice@corp.com', 'password123', 'Alice Smith', 'analyst', ORG_ID);

    expect(m.usersCreate).toHaveBeenCalledOnce();
    const createArg = m.usersCreate.mock.calls[0][0];
    expect(createArg.email).toBe('alice@corp.com');
    expect(createArg.password).toBe('password123');
    expect(createArg.passwordConfirm).toBe('password123');
    expect(createArg.name).toBe('Alice Smith');
    expect(createArg.role).toBe('analyst');
    expect(createArg.organization).toBe(ORG_ID);
    expect(createArg.verified).toBeUndefined();
  });

  it('E2: writes access_audit_log with action "user_invited" and correct org', async () => {
    await inviteUser('alice@corp.com', 'password123', 'Alice Smith', 'analyst', ORG_ID);

    expect(m.accessAuditCreate).toHaveBeenCalledOnce();
    const auditArg = m.accessAuditCreate.mock.calls[0][0];
    expect(auditArg.action).toBe('user_invited');
    expect(auditArg.resource_type).toBe('user');
    expect(auditArg.resource_id).toBe(NEW_USER_RECORD.id);
    expect(auditArg.organization).toBe(ORG_ID);
    expect(auditArg.details.email).toBe('alice@corp.com');
    expect(auditArg.details.role).toBe('analyst');
  });

  it('E3: falls back to currentOrgId when organizationId param is null', async () => {
    initializeUser(); // sets currentOrgId = ORG_ID from AUTH_USER
    await inviteUser('alice@corp.com', 'password123', '', 'analyst', null);

    expect(m.usersCreate.mock.calls[0][0].organization).toBe(ORG_ID);
    expect(m.accessAuditCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });

  it('E4: falls back to sessionStorage when param and currentOrgId are both null', async () => {
    m.authStoreRecord = null;
    initializeUser(); // currentOrgId = null
    global.sessionStorage.setItem('pb_org_id', ORG_ID);
    m.authStoreRecord = AUTH_USER; // restore for getCurrentUser in audit

    await inviteUser('alice@corp.com', 'password123', '', 'viewer', null);

    expect(m.usersCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });

  it('E5: returns the created user record', async () => {
    const result = await inviteUser('alice@corp.com', 'password123', 'Alice Smith', 'analyst', ORG_ID);
    expect(result).toEqual(NEW_USER_RECORD);
  });

  it('E6: treats empty fullName as empty string (not undefined)', async () => {
    await inviteUser('alice@corp.com', 'password123', '', 'analyst', ORG_ID);
    expect(m.usersCreate.mock.calls[0][0].name).toBe('');
  });
});

// ─── Suite F: updateUserRole() ────────────────────────────────────────────────

describe('F — updateUserRole(): fetches previous role, updates, writes audit log', () => {

  it('F1: calls getOne to fetch the previous role', async () => {
    await updateUserRole('usr_existing', 'analyst', ORG_ID);
    expect(m.usersGetOne).toHaveBeenCalledOnce();
    expect(m.usersGetOne.mock.calls[0][0]).toBe('usr_existing');
  });

  it('F2: calls update with the new role', async () => {
    await updateUserRole('usr_existing', 'analyst', ORG_ID);
    expect(m.usersUpdate).toHaveBeenCalledOnce();
    expect(m.usersUpdate.mock.calls[0][0]).toBe('usr_existing');
    expect(m.usersUpdate.mock.calls[0][1]).toEqual({ role: 'analyst' });
  });

  it('F3: writes access_audit_log with action "role_changed" and previous/new values', async () => {
    await updateUserRole('usr_existing', 'analyst', ORG_ID);

    expect(m.accessAuditCreate).toHaveBeenCalledOnce();
    const auditArg = m.accessAuditCreate.mock.calls[0][0];
    expect(auditArg.action).toBe('role_changed');
    expect(auditArg.resource_type).toBe('user');
    expect(auditArg.resource_id).toBe('usr_existing');
    expect(auditArg.organization).toBe(ORG_ID);
    expect(auditArg.details.previous_values).toEqual({ role: 'viewer' });
    expect(auditArg.details.new_values).toEqual({ role: 'analyst' });
  });

  it('F4: returns the updated user record', async () => {
    const result = await updateUserRole('usr_existing', 'analyst', ORG_ID);
    expect(result).toEqual(UPDATED_USER);
  });

  it('F5: falls back to currentOrgId when organizationId param is null', async () => {
    initializeUser(); // sets currentOrgId = ORG_ID
    await updateUserRole('usr_existing', 'admin', null);

    expect(m.accessAuditCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });
});

// ─── Suite G: removeUser() ────────────────────────────────────────────────────

describe('G — removeUser(): writes audit log before deletion', () => {

  it('G1: writes access_audit_log with action "user_deleted" BEFORE the delete call', async () => {
    const callOrder = [];
    m.accessAuditCreate.mockImplementation(() => {
      callOrder.push('audit');
      return Promise.resolve({ id: 'audit_001' });
    });
    m.usersDelete.mockImplementation(() => {
      callOrder.push('delete');
      return Promise.resolve(undefined);
    });

    await removeUser('usr_existing', ORG_ID);

    expect(callOrder).toEqual(['audit', 'delete']);
  });

  it('G2: calls users.delete with the correct userId', async () => {
    await removeUser('usr_existing', ORG_ID);

    expect(m.usersDelete).toHaveBeenCalledOnce();
    expect(m.usersDelete.mock.calls[0][0]).toBe('usr_existing');
  });

  it('G3: writes audit with action "user_deleted" and correct org', async () => {
    await removeUser('usr_existing', ORG_ID);

    const auditArg = m.accessAuditCreate.mock.calls[0][0];
    expect(auditArg.action).toBe('user_deleted');
    expect(auditArg.resource_type).toBe('user');
    expect(auditArg.resource_id).toBe('usr_existing');
    expect(auditArg.organization).toBe(ORG_ID);
  });

  it('G4: falls back to sessionStorage when param and currentOrgId are both null', async () => {
    m.authStoreRecord = null;
    initializeUser(); // currentOrgId = null
    global.sessionStorage.setItem('pb_org_id', ORG_ID);
    m.authStoreRecord = AUTH_USER; // restore for getCurrentUser in audit

    await removeUser('usr_existing', null);

    expect(m.accessAuditCreate.mock.calls[0][0].organization).toBe(ORG_ID);
  });

  it('G5: falls back to currentOrgId when organizationId param is null', async () => {
    initializeUser(); // sets currentOrgId = ORG_ID
    await removeUser('usr_existing', null);

    expect(m.accessAuditCreate.mock.calls[0][0].organization).toBe(ORG_ID);
    expect(m.usersDelete).toHaveBeenCalledOnce();
  });
});
