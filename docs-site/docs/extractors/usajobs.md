---
id: usajobs
title: USAJobs Extractor
description: Fetches federal job listings from the USAJobs.gov API.
sidebar_position: 6
---

## What it is

The USAJobs extractor fetches federal government job listings from the [USAJobs.gov](https://www.usajobs.gov) API. It is a **US-only** source, available when the selected country is United States.

## Why it exists

USAJobs.gov is the official job board for the US federal government, listing positions across all federal agencies. Many of these positions offer H-1B visa sponsorship and competitive benefits packages.

## How to use it

### Prerequisites

1. Register for a free API key at [developer.usajobs.gov](https://developer.usajobs.gov/).
2. Set the following environment variables (or configure in Settings > Environment):

| Variable | Required | Description |
|---|---|---|
| `USAJOBS_API_KEY` | Yes | Your API authorization key |
| `USAJOBS_USER_AGENT` | Yes | Your registered email address |

### Pipeline integration

Enable **USAJobs** in the source picker when running a pipeline. It automatically:

1. Searches for your configured search terms
2. Paginates through results (default max: 50 per term)
3. Extracts job title, agency, location, salary range, and full description
4. Deduplicates by job URL across search terms

### Extracted fields

| Field | Source |
|---|---|
| Title | `PositionTitle` |
| Employer | `OrganizationName` |
| Location | `PositionLocation[].LocationName` |
| Salary | `PositionRemuneration` (formatted as USD range) |
| Description | `JobSummary` + `MajorDuties` |
| Application link | `ApplyURI` |
| Date posted | `PublicationStartDate` |
| Department | `DepartmentName` |

## Common problems

### "USAJOBS_API_KEY and USAJOBS_USER_AGENT are required"

Register at [developer.usajobs.gov](https://developer.usajobs.gov/) and set both environment variables.

### No jobs returned

- Verify your API key is valid by testing directly: `curl -H "Authorization-Key: YOUR_KEY" -H "User-Agent: YOUR_EMAIL" "https://data.usajobs.gov/api/Search?Keyword=software"`
- Try broader search terms; USAJobs uses keyword matching.

### Rate limiting

The USAJobs API has rate limits. If you see 429 errors, reduce `usajobsMaxJobs` in settings or wait before retrying.

## Related pages

- [Extractor Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Visa Sponsors](/docs/next/features/visa-sponsors)
