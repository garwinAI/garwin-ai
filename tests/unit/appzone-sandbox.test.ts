import { describe, expect, it } from "vitest";
import { parseSandboxOrigin } from "@/lib/appzone-sandbox";

const APP = "https://dev.garwinai.com";

describe("parseSandboxOrigin", () => {
  it("accepts a bare https origin on another domain", () => {
    expect(parseSandboxOrigin("https://garwinapps.com", APP, true)).toBe("https://garwinapps.com");
    expect(parseSandboxOrigin(" https://garwinapps.com/ ", APP, true)).toBe("https://garwinapps.com");
  });

  it("returns null when unset or malformed", () => {
    expect(parseSandboxOrigin(undefined, APP, true)).toBeNull();
    expect(parseSandboxOrigin("", APP, true)).toBeNull();
    expect(parseSandboxOrigin("not a url", APP, true)).toBeNull();
  });

  it("rejects paths, queries, fragments and credentials", () => {
    expect(parseSandboxOrigin("https://garwinapps.com/apps", APP, true)).toBeNull();
    expect(parseSandboxOrigin("https://garwinapps.com/?x=1", APP, true)).toBeNull();
    expect(parseSandboxOrigin("https://garwinapps.com/#x", APP, true)).toBeNull();
    expect(parseSandboxOrigin("https://u:p@garwinapps.com", APP, true)).toBeNull();
  });

  it("rejects the app's own site, including parent and child domains", () => {
    expect(parseSandboxOrigin("https://dev.garwinai.com", APP, true)).toBeNull();
    expect(parseSandboxOrigin("https://garwinai.com", APP, true)).toBeNull();
    expect(parseSandboxOrigin("https://apps.dev.garwinai.com", APP, true)).toBeNull();
  });

  it("allows http only for localhost outside production", () => {
    expect(parseSandboxOrigin("http://localhost:4000", "http://localhost:3000", false)).toBe("http://localhost:4000");
    expect(parseSandboxOrigin("http://localhost:4000", "http://localhost:3000", true)).toBeNull();
    expect(parseSandboxOrigin("http://garwinapps.com", APP, false)).toBeNull();
    expect(parseSandboxOrigin("http://localhost:3000", "http://localhost:3000", false)).toBeNull();
  });
});
