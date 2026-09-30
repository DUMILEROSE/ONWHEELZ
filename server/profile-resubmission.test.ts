import { describe, expect, it } from "vitest";
import { getProfileResubmissionPatch } from "./db";

describe("ONWHEELZ partner profile resubmission", () => {
  it.each(["more_details", "rejected"] as const)(
    "requeues a %s profile and clears the previous reviewer note after an edit",
    status => {
      expect(getProfileResubmissionPatch(status)).toEqual({
        verificationStatus: "pending",
        verificationNote: null,
      });
    }
  );

  it("keeps an existing pending profile pending and clears any stale note", () => {
    expect(getProfileResubmissionPatch("pending")).toEqual({
      verificationStatus: "pending",
      verificationNote: null,
    });
  });

  it("preserves verified profiles when their details are edited", () => {
    expect(getProfileResubmissionPatch("verified")).toEqual({});
  });

  it("leaves a new profile to the database pending default", () => {
    expect(getProfileResubmissionPatch(undefined)).toEqual({});
  });
});
