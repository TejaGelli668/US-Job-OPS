import type {
  VisaSponsor,
  VisaSponsorProviderManifest,
} from "@shared/types/visa-sponsors";
import {
  mergeUsSponsors,
  parseDolLcaCsv,
  parseUscisEmployerCsv,
} from "@shared/visa-sponsors/us-csv";

const DOL_LCA_BASE_URL = "https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs";

const USCIS_EMPLOYER_HUB_URL =
  "https://www.uscis.gov/sites/default/files/document/data/h1b_datahubexport.csv";

const DOL_DISCLOSURE_PAGE_URL =
  "https://www.dol.gov/agencies/eta/foreign-labor/performance";

const DOL_CSV_PATTERN =
  /href="(https:\/\/www\.dol\.gov\/sites\/dolgov\/files\/ETA\/oflc\/pdfs\/LCA_Disclosure_Data_FY\d{4}[^"]*\.csv)"/;

async function discoverDolCsvUrl(): Promise<string> {
  const response = await fetch(DOL_DISCLOSURE_PAGE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch DOL performance page: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  const match = html.match(DOL_CSV_PATTERN);
  if (match) return match[1];

  // Fallback: construct a URL for the current fiscal year quarter
  const now = new Date();
  const fy = now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
  return `${DOL_LCA_BASE_URL}/LCA_Disclosure_Data_FY${fy}_Q4.csv`;
}

async function fetchDolSponsors(): Promise<VisaSponsor[]> {
  const csvUrl = await discoverDolCsvUrl();
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download DOL LCA CSV: ${response.status} ${response.statusText}`,
    );
  }

  return parseDolLcaCsv(await response.text());
}

async function fetchUscisSponsors(): Promise<VisaSponsor[]> {
  const response = await fetch(USCIS_EMPLOYER_HUB_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to download USCIS employer CSV: ${response.status} ${response.statusText}`,
    );
  }

  return parseUscisEmployerCsv(await response.text());
}

export const manifest: VisaSponsorProviderManifest = {
  id: "us",
  displayName: "United States",
  countryKey: "united states",
  scheduledUpdateHour: 3,

  async fetchSponsors(): Promise<VisaSponsor[]> {
    const [dolSponsors, uscisSponsors] = await Promise.allSettled([
      fetchDolSponsors(),
      fetchUscisSponsors(),
    ]);

    const dol = dolSponsors.status === "fulfilled" ? dolSponsors.value : [];
    const uscis =
      uscisSponsors.status === "fulfilled" ? uscisSponsors.value : [];

    if (dol.length === 0 && uscis.length === 0) {
      const errors: string[] = [];
      if (dolSponsors.status === "rejected") {
        errors.push(`DOL: ${dolSponsors.reason}`);
      }
      if (uscisSponsors.status === "rejected") {
        errors.push(`USCIS: ${uscisSponsors.reason}`);
      }
      throw new Error(
        `Both US sponsor data sources failed: ${errors.join("; ")}`,
      );
    }

    const merged = mergeUsSponsors(dol, uscis);
    if (merged.length === 0) {
      throw new Error("US sponsor data appears empty after merge");
    }

    return merged;
  },
};

export default manifest;
