import { resolveSearchCities } from "@shared/search-cities.js";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import { runUsajobs, type UsajobsProgressEvent } from "./src/main";

function toProgress(event: UsajobsProgressEvent): ExtractorProgressEvent {
  if (event.type === "term_start") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      currentUrl: event.searchTerm,
      detail: `USAJobs: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
    };
  }

  if (event.type === "page_fetched") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      listPagesProcessed: event.pageNo,
      jobPagesEnqueued: event.totalCollected,
      jobPagesProcessed: event.totalCollected,
      currentUrl: `page ${event.pageNo}`,
      detail: `USAJobs: term ${event.termIndex}/${event.termTotal}, page ${event.pageNo} (${event.totalCollected} collected)`,
    };
  }

  return {
    phase: "list",
    termsProcessed: event.termIndex,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    detail: `USAJobs: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
  };
}

export const manifest: ExtractorManifest = {
  id: "usajobs",
  displayName: "USAJobs",
  providesSources: ["usajobs"],
  requiredEnvVars: ["USAJOBS_API_KEY", "USAJOBS_USER_AGENT"],

  async run(context) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const apiKey = context.settings.USAJOBS_API_KEY;
    const userAgent = context.settings.USAJOBS_USER_AGENT;

    if (!apiKey || !userAgent) {
      return {
        success: false,
        jobs: [],
        error:
          "USAJOBS_API_KEY and USAJOBS_USER_AGENT are required. Register at https://developer.usajobs.gov/",
      };
    }

    const maxJobs = context.settings.usajobsMaxJobs
      ? parseInt(context.settings.usajobsMaxJobs, 10)
      : 50;

    const cities = resolveSearchCities({
      single: context.settings.searchCities ?? context.settings.jobspyLocation,
    });

    const result = await runUsajobs({
      apiKey,
      userAgent,
      searchTerms: context.searchTerms,
      location: cities[0],
      maxJobs,
      onProgress: (event) => {
        if (context.shouldCancel?.()) return;
        context.onProgress?.(toProgress(event));
      },
    });

    return result;
  },
};

export default manifest;
