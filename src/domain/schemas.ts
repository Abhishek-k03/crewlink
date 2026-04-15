import { z } from 'zod';

import { isValidImoNumber } from './imo';
import {
  ASSIGNMENT_STATUSES,
  CERTIFICATION_TYPES,
  CREW_STATUSES,
  RANKS,
  VESSEL_STATUSES,
  VESSEL_TYPES,
} from './types';

// One schema per entity, shared by the forms (field-level validation) and the
// mock API (rejecting malformed writes), so the two can't drift apart.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const vesselInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  imoNumber: z
    .string()
    .trim()
    .refine(isValidImoNumber, 'Must be 7 digits with a valid IMO check digit'),
  flag: z.string().trim().min(1, 'Flag is required'),
  type: z.enum(VESSEL_TYPES),
  status: z.enum(VESSEL_STATUSES),
  minimumSafeManning: z.partialRecord(z.enum(RANKS), z.number().int().min(0).max(50)),
  readyToSail: z.boolean(),
});
export type VesselInput = z.infer<typeof vesselInputSchema>;

export const crewInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  rank: z.enum(RANKS),
  nationality: z.string().trim().min(1, 'Nationality is required'),
  dateOfBirth: isoDate,
  status: z.enum(CREW_STATUSES),
  email: z.email('Enter a valid email address'),
  phone: z.string().trim().min(6, 'Enter a contact number'),
});
export type CrewInput = z.infer<typeof crewInputSchema>;

// Kept separate from the refined schemas below because a refinement can't
// survive `.partial()`: patches parse against this plain shape, then the
// merged record is checked against the full schema.
const assignmentFields = z.object({
  crewId: z.string().min(1),
  vesselId: z.string().min(1),
  rankOnboard: z.enum(RANKS),
  signOnDate: isoDate,
  signOffDate: isoDate,
  port: z.string().trim().min(1, 'Port is required'),
  status: z.enum(ASSIGNMENT_STATUSES),
});

export const assignmentInputSchema = assignmentFields.refine(
  (value) => value.signOnDate < value.signOffDate,
  { message: 'Sign-off must be after sign-on', path: ['signOffDate'] },
);
export const assignmentPatchSchema = assignmentFields.partial();
export type AssignmentInput = z.infer<typeof assignmentInputSchema>;

const certificationFields = z.object({
  crewId: z.string().min(1),
  type: z.enum(CERTIFICATION_TYPES),
  issueDate: isoDate,
  expiryDate: isoDate,
  issuingAuthority: z.string().trim().min(1, 'Issuing authority is required'),
  document: z
    .object({
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      sizeBytes: z.number().int().nonnegative(),
      data: z.string(),
    })
    .optional(),
});

export const certificationInputSchema = certificationFields.refine(
  (value) => value.issueDate < value.expiryDate,
  { message: 'Expiry must be after issue', path: ['expiryDate'] },
);
export const certificationPatchSchema = certificationFields.partial();
export type CertificationInput = z.infer<typeof certificationInputSchema>;
