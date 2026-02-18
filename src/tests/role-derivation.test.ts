/**
 * Role Derivation Tests
 * Ensures all supported roles are correctly mapped from flags
 */

import { deriveRolesFromFlags, RoleFlags } from '../utils/roles'
import {
  ROLE_LEADER_BACENTA,
  ROLE_LEADER_COUNCIL,
  ROLE_LEADER_CAMPUS,
  ROLE_LEADER_STREAM,
  ROLE_LEADER_GOVERNORSHIP,
  ROLE_LEADER_OVERSIGHT,
  ROLE_LEADER_DENOMINATION,
  ROLE_ADMIN_STREAM,
  ROLE_ADMIN_CAMPUS,
  ROLE_ADMIN_COUNCIL,
  ROLE_ADMIN_GOVERNORSHIP,
  ROLE_ADMIN_OVERSIGHT,
  ROLE_ADMIN_DENOMINATION,
  ROLE_ARRIVALS_ADMIN_STREAM,
  ROLE_ARRIVALS_ADMIN_CAMPUS,
  ROLE_ARRIVALS_ADMIN_COUNCIL,
  ROLE_ARRIVALS_ADMIN_GOVERNORSHIP,
  ROLE_ARRIVALS_COUNTER_STREAM,
  ROLE_ARRIVALS_PAYER_COUNCIL,
  ROLE_TELLER_STREAM,
  ROLE_FISHER,
  SUPPORTED_ROLES,
} from '../utils/permission-utils'

describe('Role Derivation', () => {
  const defaultFlags: RoleFlags = {
    leadsBacenta: false,
    leadsCampus: false,
    leadsCouncil: false,
    leadsStream: false,
    leadsGovernorship: false,
    leadsOversight: false,
    leadsDenomination: false,
    isAdminForStream: false,
    isAdminForCampus: false,
    isAdminForCouncil: false,
    isAdminForGovernorship: false,
    isAdminForOversight: false,
    isAdminForDenomination: false,
    isArrivalsAdminForStream: false,
    isArrivalsAdminForCampus: false,
    isArrivalsAdminForCouncil: false,
    isArrivalsAdminForGovernorship: false,
    isArrivalsCounterForStream: false,
    isArrivalsPayerCouncil: false,
    isTellerForStream: false,
    isFisher: false,
  }

  describe('Leader Roles', () => {
    test('should map leadsBacenta flag to leaderBacenta role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsBacenta: true,
      })
      expect(roles).toContain(ROLE_LEADER_BACENTA)
    })

    test('should map leadsCampus flag to leaderCampus role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsCampus: true,
      })
      expect(roles).toContain(ROLE_LEADER_CAMPUS)
    })

    test('should map leadsCouncil flag to leaderCouncil role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsCouncil: true,
      })
      expect(roles).toContain(ROLE_LEADER_COUNCIL)
    })

    test('should map leadsStream flag to leaderStream role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsStream: true,
      })
      expect(roles).toContain(ROLE_LEADER_STREAM)
    })

    test('should map leadsGovernorship flag to leaderGovernorship role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsGovernorship: true,
      })
      expect(roles).toContain(ROLE_LEADER_GOVERNORSHIP)
    })

    test('should map leadsOversight flag to leaderOversight role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsOversight: true,
      })
      expect(roles).toContain(ROLE_LEADER_OVERSIGHT)
    })

    test('should map leadsDenomination flag to leaderDenomination role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsDenomination: true,
      })
      expect(roles).toContain(ROLE_LEADER_DENOMINATION)
    })
  })

  describe('Admin Roles', () => {
    test('should map isAdminForStream flag to adminStream role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isAdminForStream: true,
      })
      expect(roles).toContain(ROLE_ADMIN_STREAM)
    })

    test('should map isAdminForCampus flag to adminCampus role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isAdminForCampus: true,
      })
      expect(roles).toContain(ROLE_ADMIN_CAMPUS)
    })

    test('should map isAdminForCouncil flag to adminCouncil role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isAdminForCouncil: true,
      })
      expect(roles).toContain(ROLE_ADMIN_COUNCIL)
    })

    test('should map isAdminForGovernorship flag to adminGovernorship role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isAdminForGovernorship: true,
      })
      expect(roles).toContain(ROLE_ADMIN_GOVERNORSHIP)
    })

    test('should map isAdminForOversight flag to adminOversight role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isAdminForOversight: true,
      })
      expect(roles).toContain(ROLE_ADMIN_OVERSIGHT)
    })

    test('should map isAdminForDenomination flag to adminDenomination role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isAdminForDenomination: true,
      })
      expect(roles).toContain(ROLE_ADMIN_DENOMINATION)
    })
  })

  describe('Arrivals Admin Roles', () => {
    test('should map isArrivalsAdminForStream flag to arrivalsAdminStream role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isArrivalsAdminForStream: true,
      })
      expect(roles).toContain(ROLE_ARRIVALS_ADMIN_STREAM)
    })

    test('should map isArrivalsAdminForCampus flag to arrivalsAdminCampus role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isArrivalsAdminForCampus: true,
      })
      expect(roles).toContain(ROLE_ARRIVALS_ADMIN_CAMPUS)
    })

    test('should map isArrivalsAdminForCouncil flag to arrivalsAdminCouncil role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isArrivalsAdminForCouncil: true,
      })
      expect(roles).toContain(ROLE_ARRIVALS_ADMIN_COUNCIL)
    })

    test('should map isArrivalsAdminForGovernorship flag to arrivalsAdminGovernorship role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isArrivalsAdminForGovernorship: true,
      })
      expect(roles).toContain(ROLE_ARRIVALS_ADMIN_GOVERNORSHIP)
    })
  })

  describe('Arrivals Helper Roles', () => {
    test('should map isArrivalsCounterForStream flag to arrivalsCounterStream role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isArrivalsCounterForStream: true,
      })
      expect(roles).toContain(ROLE_ARRIVALS_COUNTER_STREAM)
    })

    test('should map isArrivalsPayerCouncil flag to arrivalsPayerCouncil role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isArrivalsPayerCouncil: true,
      })
      expect(roles).toContain(ROLE_ARRIVALS_PAYER_COUNCIL)
      // Ensure it's NOT mapped to 'tellerCouncil'
      expect(roles).not.toContain('tellerCouncil')
    })
  })

  describe('Teller Roles', () => {
    test('should map isTellerForStream flag to tellerStream role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isTellerForStream: true,
      })
      expect(roles).toContain(ROLE_TELLER_STREAM)
    })
  })

  describe('Fisher Role', () => {
    test('should map isFisher flag to fisher role', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isFisher: true,
      })
      expect(roles).toContain(ROLE_FISHER)
    })
  })

  describe('Multiple Roles', () => {
    test('should return all roles when user has multiple role flags set', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsBacenta: true,
        isAdminForStream: true,
        isArrivalsAdminForCampus: true,
        isArrivalsCounterForStream: true,
        isTellerForStream: true,
        isFisher: true,
      })

      expect(roles).toContain(ROLE_LEADER_BACENTA)
      expect(roles).toContain(ROLE_ADMIN_STREAM)
      expect(roles).toContain(ROLE_ARRIVALS_ADMIN_CAMPUS)
      expect(roles).toContain(ROLE_ARRIVALS_COUNTER_STREAM)
      expect(roles).toContain(ROLE_TELLER_STREAM)
      expect(roles).toContain(ROLE_FISHER)
      expect(roles.length).toBe(6)
    })

    test('should handle user with many leadership and admin roles', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsDenomination: true,
        leadsOversight: true,
        leadsCouncil: true,
        isAdminForDenomination: true,
        isAdminForOversight: true,
      })

      expect(roles).toContain(ROLE_LEADER_DENOMINATION)
      expect(roles).toContain(ROLE_LEADER_OVERSIGHT)
      expect(roles).toContain(ROLE_LEADER_COUNCIL)
      expect(roles).toContain(ROLE_ADMIN_DENOMINATION)
      expect(roles).toContain(ROLE_ADMIN_OVERSIGHT)
      expect(roles.length).toBe(5)
    })

    test('should return complete representation of all arrivals roles', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        isArrivalsAdminForStream: true,
        isArrivalsAdminForCampus: true,
        isArrivalsAdminForCouncil: true,
        isArrivalsAdminForGovernorship: true,
        isArrivalsCounterForStream: true,
        isArrivalsPayerCouncil: true,
      })

      expect(roles).toContain(ROLE_ARRIVALS_ADMIN_STREAM)
      expect(roles).toContain(ROLE_ARRIVALS_ADMIN_CAMPUS)
      expect(roles).toContain(ROLE_ARRIVALS_ADMIN_COUNCIL)
      expect(roles).toContain(ROLE_ARRIVALS_ADMIN_GOVERNORSHIP)
      expect(roles).toContain(ROLE_ARRIVALS_COUNTER_STREAM)
      expect(roles).toContain(ROLE_ARRIVALS_PAYER_COUNCIL)
      expect(roles.length).toBe(6)
    })
  })

  describe('No Roles', () => {
    test('should return empty array when user has no role flags set', () => {
      const roles = deriveRolesFromFlags(defaultFlags)
      expect(roles).toEqual([])
    })
  })

  describe('Role Validation', () => {
    test('should only return supported roles', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsBacenta: true,
        isAdminForStream: true,
        isFisher: true,
      })

      // All returned roles should be in SUPPORTED_ROLES
      roles.forEach((role) => {
        expect(SUPPORTED_ROLES).toContain(role as any)
      })
    })

    test('should remove duplicates from roles array', () => {
      const roles = deriveRolesFromFlags({
        ...defaultFlags,
        leadsBacenta: true,
        leadsCampus: true,
      })

      // Check that there are no duplicates
      expect(roles.length).toBe(new Set(roles).size)
    })
  })
})
