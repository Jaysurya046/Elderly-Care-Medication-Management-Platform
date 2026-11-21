import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  DEFAULT_ROLE_SCOPES,
  MembershipAccessContext,
  Role,
} from '../permissions';

describe('Permission Matrix & RBAC (packages/core)', () => {
  it('denies all permissions if membership status is REVOKED or INVITED', () => {
    const revokedMembership: MembershipAccessContext = {
      role: 'OWNER',
      scopes: DEFAULT_ROLE_SCOPES.OWNER,
      status: 'REVOKED',
    };

    expect(hasPermission(revokedMembership, 'read:medications')).toBe(false);
    expect(hasPermission(revokedMembership, 'write:medications')).toBe(false);

    const invitedMembership: MembershipAccessContext = {
      role: 'CAREGIVER',
      scopes: DEFAULT_ROLE_SCOPES.CAREGIVER,
      status: 'INVITED',
    };
    expect(hasPermission(invitedMembership, 'read:medications')).toBe(false);
  });

  it('allows OWNER full access to all operations including private items', () => {
    const ownerMembership: MembershipAccessContext = {
      role: 'OWNER',
      scopes: DEFAULT_ROLE_SCOPES.OWNER,
      status: 'ACTIVE',
    };

    expect(hasPermission(ownerMembership, 'read:medications')).toBe(true);
    expect(hasPermission(ownerMembership, 'write:medications')).toBe(true);
    expect(hasPermission(ownerMembership, 'read:appointments', { isPrivateItem: true })).toBe(true);
    expect(hasPermission(ownerMembership, 'manage:circle')).toBe(true);
    expect(hasPermission(ownerMembership, 'delete:profile')).toBe(true);
  });

  it('enforces CAREGIVER scopes and blocks private items by default', () => {
    const caregiverMembership: MembershipAccessContext = {
      role: 'CAREGIVER',
      scopes: DEFAULT_ROLE_SCOPES.CAREGIVER,
      status: 'ACTIVE',
    };

    expect(hasPermission(caregiverMembership, 'read:medications')).toBe(true);
    expect(hasPermission(caregiverMembership, 'write:medications')).toBe(true);
    expect(hasPermission(caregiverMembership, 'read:notes')).toBe(true);
    expect(hasPermission(caregiverMembership, 'write:notes')).toBe(true);

    // Private item check: Caregiver does not have view_private_items by default
    expect(
      hasPermission(caregiverMembership, 'read:appointments', { isPrivateItem: true })
    ).toBe(false);

    // Cannot delete profile or manage circle
    expect(hasPermission(caregiverMembership, 'manage:circle')).toBe(false);
    expect(hasPermission(caregiverMembership, 'delete:profile')).toBe(false);
  });

  it('allows CAREGIVER to view private items only when elder explicitly grants view_private_items', () => {
    const caregiverWithPrivate: MembershipAccessContext = {
      role: 'CAREGIVER',
      scopes: {
        ...DEFAULT_ROLE_SCOPES.CAREGIVER,
        view_private_items: true,
      },
      status: 'ACTIVE',
    };

    expect(
      hasPermission(caregiverWithPrivate, 'read:appointments', { isPrivateItem: true })
    ).toBe(true);
    expect(
      hasPermission(caregiverWithPrivate, 'read:notes', { isPrivateItem: true })
    ).toBe(true);
  });

  it('restricts FAMILY role to view-only and blocks write actions', () => {
    const familyMembership: MembershipAccessContext = {
      role: 'FAMILY',
      scopes: DEFAULT_ROLE_SCOPES.FAMILY,
      status: 'ACTIVE',
    };

    expect(hasPermission(familyMembership, 'read:medications')).toBe(true);
    expect(hasPermission(familyMembership, 'read:appointments')).toBe(true);
    expect(hasPermission(familyMembership, 'write:medications')).toBe(false);
    expect(hasPermission(familyMembership, 'write:appointments')).toBe(false);
    expect(hasPermission(familyMembership, 'write:notes')).toBe(false);
    expect(hasPermission(familyMembership, 'read:appointments', { isPrivateItem: true })).toBe(
      false
    );
  });

  it('restricts EMERGENCY_VIEWER exclusively to the emergency card', () => {
    const emergencyViewer: MembershipAccessContext = {
      role: 'EMERGENCY_VIEWER',
      scopes: DEFAULT_ROLE_SCOPES.EMERGENCY_VIEWER,
      status: 'ACTIVE',
    };

    expect(hasPermission(emergencyViewer, 'read:emergency_card')).toBe(true);
    expect(hasPermission(emergencyViewer, 'read:medications')).toBe(false);
    expect(hasPermission(emergencyViewer, 'write:medications')).toBe(false);
    expect(hasPermission(emergencyViewer, 'read:appointments')).toBe(false);
    expect(hasPermission(emergencyViewer, 'read:notes')).toBe(false);
  });
});
