import type { VisaSponsor } from "../types/visa-sponsors";

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  const normalized = headers.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  for (const candidate of candidates) {
    const target = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
    const idx = normalized.indexOf(target);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parse DOL H-1B LCA disclosure data CSV.
 * Column names vary across fiscal years; matching is case/whitespace-insensitive.
 */
export function parseDolLcaCsv(content: string): VisaSponsor[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);

  const employerIdx = findColumnIndex(headers, [
    "EMPLOYER_NAME",
    "LCA_CASE_EMPLOYER_NAME",
  ]);
  const cityIdx = findColumnIndex(headers, [
    "EMPLOYER_CITY",
    "LCA_CASE_EMPLOYER_CITY",
    "WORKSITE_CITY",
  ]);
  const stateIdx = findColumnIndex(headers, [
    "EMPLOYER_STATE",
    "LCA_CASE_EMPLOYER_STATE",
    "WORKSITE_STATE",
  ]);
  const visaClassIdx = findColumnIndex(headers, ["VISA_CLASS"]);
  const statusIdx = findColumnIndex(headers, ["CASE_STATUS"]);

  if (employerIdx === -1) return [];

  const seen = new Map<string, VisaSponsor>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    const status =
      statusIdx !== -1 ? (fields[statusIdx]?.toUpperCase() ?? "") : "";
    if (
      status &&
      status !== "CERTIFIED" &&
      status !== "CERTIFIED - WITHDRAWN"
    ) {
      continue;
    }

    const employer = fields[employerIdx]?.trim() ?? "";
    if (!employer) continue;

    const key = employer.toLowerCase();
    if (seen.has(key)) continue;

    seen.set(key, {
      organisationName: employer,
      townCity: cityIdx !== -1 ? (fields[cityIdx]?.trim() ?? "") : "",
      county: stateIdx !== -1 ? (fields[stateIdx]?.trim() ?? "") : "",
      typeRating:
        visaClassIdx !== -1 ? (fields[visaClassIdx]?.trim() ?? "") : "H-1B",
      route: "H-1B",
    });
  }

  return Array.from(seen.values());
}

/**
 * Parse USCIS H-1B employer data hub CSV.
 * Columns: Fiscal Year, Employer, Initial Approvals, Initial Denials,
 *          Continuing Approvals, Continuing Denials, NAICS, Tax ID,
 *          State, City, ZIP
 */
export function parseUscisEmployerCsv(content: string): VisaSponsor[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);

  const employerIdx = findColumnIndex(headers, ["Employer", "EMPLOYER"]);
  const cityIdx = findColumnIndex(headers, ["City", "CITY"]);
  const stateIdx = findColumnIndex(headers, ["State", "STATE"]);
  const naicsIdx = findColumnIndex(headers, ["NAICS", "NAICS_CODE"]);
  const fiscalYearIdx = findColumnIndex(headers, [
    "Fiscal Year",
    "FISCAL_YEAR",
  ]);
  const initialApprovalsIdx = findColumnIndex(headers, [
    "Initial Approvals",
    "INITIAL_APPROVALS",
  ]);
  const continuingApprovalsIdx = findColumnIndex(headers, [
    "Continuing Approvals",
    "CONTINUING_APPROVALS",
  ]);

  if (employerIdx === -1) return [];

  const seen = new Map<string, VisaSponsor>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCsvLine(line);
    const employer = fields[employerIdx]?.trim() ?? "";
    if (!employer) continue;

    const key = employer.toLowerCase();
    if (seen.has(key)) continue;

    let approvedPetitions: number | undefined;
    if (initialApprovalsIdx !== -1) {
      const initial = parseInt(fields[initialApprovalsIdx] ?? "0", 10) || 0;
      const continuing =
        continuingApprovalsIdx !== -1
          ? parseInt(fields[continuingApprovalsIdx] ?? "0", 10) || 0
          : 0;
      approvedPetitions = initial + continuing;
    }

    seen.set(key, {
      organisationName: employer,
      townCity: cityIdx !== -1 ? (fields[cityIdx]?.trim() ?? "") : "",
      county: stateIdx !== -1 ? (fields[stateIdx]?.trim() ?? "") : "",
      typeRating: "H-1B",
      route: "H-1B",
      approvedPetitions,
      fiscalYear:
        fiscalYearIdx !== -1
          ? (fields[fiscalYearIdx]?.trim() ?? "")
          : undefined,
      naicsCode: naicsIdx !== -1 ? (fields[naicsIdx]?.trim() ?? "") : undefined,
    });
  }

  return Array.from(seen.values());
}

/**
 * Merge sponsors from DOL LCA and USCIS sources, deduplicating by employer name.
 * USCIS data enriches DOL entries with approval counts and NAICS codes.
 */
export function mergeUsSponsors(
  dolSponsors: VisaSponsor[],
  uscisSponsors: VisaSponsor[],
): VisaSponsor[] {
  const merged = new Map<string, VisaSponsor>();

  for (const sponsor of dolSponsors) {
    merged.set(sponsor.organisationName.toLowerCase(), sponsor);
  }

  for (const sponsor of uscisSponsors) {
    const key = sponsor.organisationName.toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      existing.approvedPetitions = sponsor.approvedPetitions;
      existing.fiscalYear = sponsor.fiscalYear;
      existing.naicsCode = sponsor.naicsCode;
    } else {
      merged.set(key, sponsor);
    }
  }

  return Array.from(merged.values());
}
