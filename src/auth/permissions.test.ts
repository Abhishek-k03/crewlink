import { describe, expect, it } from 'vitest';

import { can, landingPathFor, permissionScope } from './permissions';

/** Mirrors the role permission matrix in the project specification. */
describe('permission matrix', () => {
  it('grants the Fleet Manager full scope on every action', () => {
    expect(permissionScope('Fleet Manager', 'dashboard:view')).toBe('all');
    expect(permissionScope('Fleet Manager', 'vessel:write')).toBe('all');
    expect(permissionScope('Fleet Manager', 'vessel:markReadyToSail')).toBe('all');
    expect(permissionScope('Fleet Manager', 'crew:write')).toBe('all');
    expect(permissionScope('Fleet Manager', 'assignment:write')).toBe('all');
    expect(permissionScope('Fleet Manager', 'certification:write')).toBe('all');
  });

  it('gives the Crewing Officer read-only vessels but full crew and rotations', () => {
    expect(permissionScope('Crewing Officer', 'vessel:read')).toBe('all');
    expect(permissionScope('Crewing Officer', 'vessel:write')).toBe('none');
    expect(permissionScope('Crewing Officer', 'crew:write')).toBe('all');
    expect(permissionScope('Crewing Officer', 'assignment:write')).toBe('all');
    expect(permissionScope('Crewing Officer', 'certification:write')).toBe('all');
  });

  it('reserves marking a vessel ready to sail for the Fleet Manager', () => {
    expect(permissionScope('Crewing Officer', 'vessel:markReadyToSail')).toBe('none');
    expect(permissionScope('Crew Member', 'vessel:markReadyToSail')).toBe('none');
  });

  it('limits the Crew Member to their own records', () => {
    expect(permissionScope('Crew Member', 'dashboard:view')).toBe('none');
    expect(permissionScope('Crew Member', 'crew:read')).toBe('own');
    expect(permissionScope('Crew Member', 'crew:write')).toBe('none');
    expect(permissionScope('Crew Member', 'assignment:read')).toBe('own');
    expect(permissionScope('Crew Member', 'assignment:write')).toBe('none');
    expect(permissionScope('Crew Member', 'certification:write')).toBe('own');
  });

  it('lets a Crew Member add a certificate but never remove one', () => {
    // Deleting an expired certificate is how a crew member would hide their own
    // non-compliance, so upload and delete are separate permissions.
    expect(can('Crew Member', 'certification:write', 'crew-1', 'crew-1')).toBe(true);
    expect(can('Crew Member', 'certification:delete', 'crew-1', 'crew-1')).toBe(false);
  });

  it('lets both fleet roles remove a certificate', () => {
    expect(can('Fleet Manager', 'certification:delete', undefined, 'crew-1')).toBe(true);
    expect(can('Crewing Officer', 'certification:delete', undefined, 'crew-1')).toBe(true);
  });
});

describe('can', () => {
  it('allows an `all` scope regardless of who owns the record', () => {
    expect(can('Fleet Manager', 'certification:write', undefined, 'crew-99')).toBe(true);
  });

  it('refuses a `none` scope even for the viewer\'s own record', () => {
    expect(can('Crew Member', 'crew:write', 'crew-1', 'crew-1')).toBe(false);
  });

  it('allows an `own` scope only on the viewer\'s own record', () => {
    expect(can('Crew Member', 'certification:write', 'crew-1', 'crew-1')).toBe(true);
    expect(can('Crew Member', 'certification:write', 'crew-1', 'crew-2')).toBe(false);
  });

  it('refuses an `own` scope when no record is named, so capability checks cannot leak', () => {
    expect(can('Crew Member', 'certification:write', 'crew-1')).toBe(false);
  });
});

describe('landingPathFor', () => {
  it('sends dashboard-capable roles to the dashboard', () => {
    expect(landingPathFor('Fleet Manager')).toBe('/dashboard');
    expect(landingPathFor('Crewing Officer')).toBe('/dashboard');
  });

  it('sends the Crew Member to their own profile', () => {
    expect(landingPathFor('Crew Member')).toBe('/me');
  });
});
