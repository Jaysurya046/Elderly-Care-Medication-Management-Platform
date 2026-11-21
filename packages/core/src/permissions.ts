export type Role = 'OWNER' | 'CAREGIVER' | 'FAMILY' | 'EMERGENCY_VIEWER';

export type ScopeKey =
  | 'view_medications'
  | 'manage_medications'
  | 'view_appointments'
  | 'manage_appointments'
  | 'view_notes'
  | 'write_notes'
  | 'receive_missed_dose_alerts'
  | 'view_private_items';

export type Scopes = Record<ScopeKey, boolean>;

export const ALL_SCOPES: ScopeKey[] = [
  'view_medications',
  'manage_medications',
  'view_appointments',
  'manage_appointments',
  'view_notes',
  'write_notes',
  'receive_missed_dose_alerts',
  'view_private_items',
];

export const DEFAULT_ROLE_SCOPES: Record<Role, Scopes> = {
  OWNER: {
    view_medications: true,
    manage_medications: true,
    view_appointments: true,
    manage_appointments: true,
    view_notes: true,
    write_notes: true,
    receive_missed_dose_alerts: true,
    view_private_items: true,
  },
  CAREGIVER: {
    view_medications: true,
    manage_medications: true,
    view_appointments: true,
    manage_appointments: true,
    view_notes: true,
    write_notes: true,
    receive_missed_dose_alerts: true,
    view_private_items: false, // private items require explicit elder grant
  },
  FAMILY: {
    view_medications: true,
    manage_medications: false,
    view_appointments: true,
    manage_appointments: false,
    view_notes: true,
    write_notes: false,
    receive_missed_dose_alerts: true,
    view_private_items: false,
  },
  EMERGENCY_VIEWER: {
    view_medications: false,
    manage_medications: false,
    view_appointments: false,
    manage_appointments: false,
    view_notes: false,
    write_notes: false,
    receive_missed_dose_alerts: false,
    view_private_items: false,
  },
};

export interface MembershipAccessContext {
  role: Role;
  scopes: Partial<Scopes>;
  status: 'INVITED' | 'ACTIVE' | 'REVOKED';
}

export type ActionType =
  | 'read:medications'
  | 'write:medications'
  | 'read:appointments'
  | 'write:appointments'
  | 'read:notes'
  | 'write:notes'
  | 'read:emergency_card'
  | 'manage:circle'
  | 'delete:profile';

/**
 * Pure evaluation of permissions based on membership role, scopes, status, and item privacy.
 */
export function hasPermission(
  membership: MembershipAccessContext,
  action: ActionType,
  options?: { isPrivateItem?: boolean }
): boolean {
  // If membership is not ACTIVE, all access is denied immediately
  if (membership.status !== 'ACTIVE') {
    return false;
  }

  // Check private items barrier
  if (options?.isPrivateItem) {
    // Only permitted if membership explicitly has view_private_items
    if (!membership.scopes.view_private_items && membership.role !== 'OWNER') {
      return false;
    }
  }

  // EMERGENCY_VIEWER can only view emergency card
  if (membership.role === 'EMERGENCY_VIEWER') {
    return action === 'read:emergency_card';
  }

  // OWNER has total control over profile
  if (membership.role === 'OWNER') {
    return true;
  }

  // Scope check for specific actions
  switch (action) {
    case 'read:medications':
      return Boolean(membership.scopes.view_medications);
    case 'write:medications':
      return Boolean(membership.scopes.manage_medications);
    case 'read:appointments':
      return Boolean(membership.scopes.view_appointments);
    case 'write:appointments':
      return Boolean(membership.scopes.manage_appointments);
    case 'read:notes':
      return Boolean(membership.scopes.view_notes);
    case 'write:notes':
      return Boolean(membership.scopes.write_notes);
    case 'read:emergency_card':
      // Anyone with view_medications or EMERGENCY_VIEWER can read emergency card
      return Boolean(membership.scopes.view_medications);
    case 'manage:circle':
    case 'delete:profile':
      // Only OWNER can manage the circle invitations and delete profile
      return false;
    default:
      return false;
  }
}
