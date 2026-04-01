import type { CreateJobInput } from "@shared/types/jobs";

const USAJOBS_API_BASE = "https://data.usajobs.gov/api/Search";

interface UsajobsSearchResult {
  MatchedObjectId: string;
  MatchedObjectDescriptor: {
    PositionTitle: string;
    OrganizationName: string;
    PositionURI: string;
    ApplyURI?: string[];
    PositionLocation?: Array<{
      LocationName: string;
      CityName?: string;
      CountrySubDivisionCode?: string;
    }>;
    PositionRemuneration?: Array<{
      MinimumRange: string;
      MaximumRange: string;
      RateIntervalCode: string;
    }>;
    QualificationSummary?: string;
    UserArea?: {
      Details?: {
        MajorDuties?: string[];
        JobSummary?: string;
      };
    };
    PublicationStartDate?: string;
    PositionOfferingType?: Array<{ Code: string; Name: string }>;
    JobCategory?: Array<{ Code: string; Name: string }>;
    DepartmentName?: string;
    PositionSchedule?: Array<{ Code: string; Name: string }>;
  };
}

interface UsajobsApiResponse {
  SearchResult: {
    SearchResultCount: number;
    SearchResultCountAll: number;
    SearchResultItems: Array<{
      MatchedObjectId: string;
      MatchedObjectDescriptor: UsajobsSearchResult["MatchedObjectDescriptor"];
    }>;
  };
}

export interface UsajobsRunOptions {
  apiKey: string;
  userAgent: string;
  searchTerms: string[];
  location?: string;
  maxJobs: number;
  onProgress?: (event: UsajobsProgressEvent) => void;
}

export interface UsajobsProgressEvent {
  type: "term_start" | "page_fetched" | "term_complete";
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  totalCollected?: number;
  pageNo?: number;
}

function formatSalary(
  remuneration: UsajobsSearchResult["MatchedObjectDescriptor"]["PositionRemuneration"],
): string | undefined {
  if (!remuneration?.[0]) return undefined;
  const r = remuneration[0];
  const min = parseFloat(r.MinimumRange);
  const max = parseFloat(r.MaximumRange);
  if (Number.isNaN(min) && Number.isNaN(max)) return undefined;
  const interval =
    r.RateIntervalCode === "PA" ? "/yr" : `/${r.RateIntervalCode}`;
  if (!Number.isNaN(min) && !Number.isNaN(max)) {
    return `$${min.toLocaleString("en-US")} - $${max.toLocaleString("en-US")}${interval}`;
  }
  return `$${(Number.isNaN(min) ? max : min).toLocaleString("en-US")}${interval}`;
}

function formatLocation(
  locations: UsajobsSearchResult["MatchedObjectDescriptor"]["PositionLocation"],
): string | undefined {
  if (!locations?.length) return undefined;
  return locations
    .map(
      (l) =>
        l.LocationName ||
        [l.CityName, l.CountrySubDivisionCode].filter(Boolean).join(", "),
    )
    .filter(Boolean)
    .join("; ");
}

function buildDescription(
  descriptor: UsajobsSearchResult["MatchedObjectDescriptor"],
): string {
  const parts: string[] = [];
  const summary =
    descriptor.UserArea?.Details?.JobSummary || descriptor.QualificationSummary;
  if (summary) parts.push(summary);
  const duties = descriptor.UserArea?.Details?.MajorDuties;
  if (duties?.length) {
    parts.push(`Major Duties:\n${duties.map((d) => `- ${d}`).join("\n")}`);
  }
  return parts.join("\n\n") || "No description available.";
}

function mapToJob(
  item: UsajobsApiResponse["SearchResult"]["SearchResultItems"][0],
): CreateJobInput {
  const d = item.MatchedObjectDescriptor;
  return {
    source: "usajobs",
    title: d.PositionTitle,
    employer: d.OrganizationName,
    jobUrl: d.PositionURI,
    applicationLink: d.ApplyURI?.[0],
    salary: formatSalary(d.PositionRemuneration),
    location: formatLocation(d.PositionLocation),
    jobDescription: buildDescription(d),
    sourceJobId: item.MatchedObjectId,
    datePosted: d.PublicationStartDate,
    companyIndustry: d.DepartmentName,
    salaryCurrency: "USD",
  };
}

export async function runUsajobs(options: UsajobsRunOptions): Promise<{
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}> {
  const { apiKey, userAgent, searchTerms, location, maxJobs, onProgress } =
    options;
  const allJobs: CreateJobInput[] = [];
  const seenUrls = new Set<string>();

  for (let termIdx = 0; termIdx < searchTerms.length; termIdx++) {
    const term = searchTerms[termIdx];
    onProgress?.({
      type: "term_start",
      termIndex: termIdx + 1,
      termTotal: searchTerms.length,
      searchTerm: term,
    });

    let page = 1;
    let termCollected = 0;
    const perPage = 50;

    while (termCollected < maxJobs) {
      const params = new URLSearchParams({
        Keyword: term,
        ResultsPerPage: String(perPage),
        Page: String(page),
      });
      if (location) params.set("LocationName", location);

      const response = await fetch(`${USAJOBS_API_BASE}?${params}`, {
        headers: {
          "Authorization-Key": apiKey,
          "User-Agent": userAgent,
          Host: "data.usajobs.gov",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          jobs: allJobs,
          error: `USAJobs API ${response.status}: ${response.statusText}`,
        };
      }

      const data = (await response.json()) as UsajobsApiResponse;
      const items = data.SearchResult.SearchResultItems;

      if (items.length === 0) break;

      for (const item of items) {
        if (termCollected >= maxJobs) break;
        const job = mapToJob(item);
        if (!seenUrls.has(job.jobUrl)) {
          seenUrls.add(job.jobUrl);
          allJobs.push(job);
          termCollected++;
        }
      }

      onProgress?.({
        type: "page_fetched",
        termIndex: termIdx + 1,
        termTotal: searchTerms.length,
        searchTerm: term,
        totalCollected: allJobs.length,
        pageNo: page,
      });

      if (items.length < perPage) break;
      page++;
    }

    onProgress?.({
      type: "term_complete",
      termIndex: termIdx + 1,
      termTotal: searchTerms.length,
      searchTerm: term,
      totalCollected: allJobs.length,
    });
  }

  return { success: true, jobs: allJobs };
}
