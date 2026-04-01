import { describe, expect, it } from "vitest";
import {
  mergeUsSponsors,
  parseDolLcaCsv,
  parseUscisEmployerCsv,
} from "./us-csv";

describe("parseDolLcaCsv", () => {
  it("parses certified LCA rows and deduplicates by employer", () => {
    const csv = [
      "CASE_STATUS,EMPLOYER_NAME,EMPLOYER_CITY,EMPLOYER_STATE,VISA_CLASS",
      "CERTIFIED,Google LLC,Mountain View,CA,H-1B",
      "CERTIFIED,Google LLC,New York,NY,H-1B",
      "DENIED,Bad Corp,Nowhere,TX,H-1B",
      "CERTIFIED,Microsoft Corporation,Redmond,WA,H-1B",
    ].join("\n");

    const sponsors = parseDolLcaCsv(csv);
    expect(sponsors).toHaveLength(2);
    expect(sponsors[0].organisationName).toBe("Google LLC");
    expect(sponsors[0].townCity).toBe("Mountain View");
    expect(sponsors[0].county).toBe("CA");
    expect(sponsors[0].route).toBe("H-1B");
    expect(sponsors[1].organisationName).toBe("Microsoft Corporation");
  });

  it("returns empty for no header match", () => {
    expect(parseDolLcaCsv("col1,col2\na,b")).toEqual([]);
  });
});

describe("parseUscisEmployerCsv", () => {
  it("parses employer data with approval counts", () => {
    const csv = [
      "Fiscal Year,Employer,Initial Approvals,Initial Denials,Continuing Approvals,Continuing Denials,NAICS,Tax ID,State,City,ZIP",
      "2024,Amazon.com Inc,500,10,300,5,518210,12345,WA,Seattle,98101",
      "2024,Meta Platforms Inc,400,8,200,3,519130,67890,CA,Menlo Park,94025",
    ].join("\n");

    const sponsors = parseUscisEmployerCsv(csv);
    expect(sponsors).toHaveLength(2);
    expect(sponsors[0].organisationName).toBe("Amazon.com Inc");
    expect(sponsors[0].county).toBe("WA");
    expect(sponsors[0].approvedPetitions).toBe(800);
    expect(sponsors[0].naicsCode).toBe("518210");
    expect(sponsors[1].approvedPetitions).toBe(600);
  });
});

describe("mergeUsSponsors", () => {
  it("merges DOL and USCIS data, enriching DOL entries with USCIS counts", () => {
    const dol = [
      {
        organisationName: "Google LLC",
        townCity: "Mountain View",
        county: "CA",
        typeRating: "H-1B",
        route: "H-1B",
      },
      {
        organisationName: "Stripe Inc",
        townCity: "San Francisco",
        county: "CA",
        typeRating: "H-1B",
        route: "H-1B",
      },
    ];
    const uscis = [
      {
        organisationName: "Google LLC",
        townCity: "Mountain View",
        county: "CA",
        typeRating: "H-1B",
        route: "H-1B",
        approvedPetitions: 5000,
        naicsCode: "518210",
      },
      {
        organisationName: "Apple Inc",
        townCity: "Cupertino",
        county: "CA",
        typeRating: "H-1B",
        route: "H-1B",
        approvedPetitions: 3000,
      },
    ];

    const merged = mergeUsSponsors(dol, uscis);
    expect(merged).toHaveLength(3);

    const google = merged.find((s) => s.organisationName === "Google LLC");
    expect(google?.approvedPetitions).toBe(5000);
    expect(google?.naicsCode).toBe("518210");

    const apple = merged.find((s) => s.organisationName === "Apple Inc");
    expect(apple).toBeDefined();
  });
});
