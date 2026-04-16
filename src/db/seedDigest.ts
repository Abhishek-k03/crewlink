import { RANKS } from '@/domain/types';

import type { SeedDataset } from './seed';

// Renders a generated dataset to canonical text so it can be hashed. The .NET
// backend's SeedDigest.cs builds the same string, and both test suites assert
// the same constant — proof the two generators produce an identical fleet.
// Free of node:crypto so this stays importable from browser code; the test
// does the actual hashing.
export function canonicaliseSeed(data: SeedDataset): string {
  const lines: string[] = [];

  for (const vessel of data.vessels) {
    const manning = RANKS.filter((rank) => vessel.minimumSafeManning[rank] !== undefined)
      .map((rank) => `${rank}=${vessel.minimumSafeManning[rank]}`)
      .join(',');

    lines.push(
      `V|${vessel.id}|${vessel.name}|${vessel.imoNumber}|${vessel.flag}|${vessel.type}|` +
        `${vessel.status}|${manning}|${vessel.readyToSail}`,
    );
  }

  for (const member of data.crew) {
    lines.push(
      `C|${member.id}|${member.name}|${member.rank}|${member.nationality}|` +
        `${member.dateOfBirth}|${member.status}|${member.email}|${member.phone}`,
    );
  }

  for (const assignment of data.assignments) {
    lines.push(
      `A|${assignment.id}|${assignment.crewId}|${assignment.vesselId}|${assignment.rankOnboard}|` +
        `${assignment.signOnDate}|${assignment.signOffDate}|${assignment.port}|${assignment.status}`,
    );
  }

  for (const certification of data.certifications) {
    lines.push(
      `X|${certification.id}|${certification.crewId}|${certification.type}|` +
        `${certification.issueDate}|${certification.expiryDate}|${certification.issuingAuthority}`,
    );
  }

  return lines.map((line) => `${line}\n`).join('');
}
