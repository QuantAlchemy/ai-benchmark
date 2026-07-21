import { describe, expect, it } from "vitest";
import {
  MAX_ARTIFACT_BYTES,
  MAX_ARTIFACT_CHUNKS,
  MAX_CHUNK_BYTES,
  MAX_PULL_LIMIT,
  assertRunPrincipalAuthorization,
  hashArtifactBlobs,
  isExactRunPushReplay,
  parseBearerToken,
  parsePullBounds,
  validateArtifactFinalize,
  validateRunPush,
} from "./protocol";

const digest = (character: string) => character.repeat(64);

it("hashes stored artifact chunks as one ordered byte sequence", async () => {
  const actual = await hashArtifactBlobs([new Blob(["hello"]), new Blob(["world"])]);
  expect(actual).toEqual({
    digest: "936a185caaa266bb9cbe981e9e05cb78cd732b0b3280eb944412bb6f8f8f07af",
    chunks: [
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      "486ea46224d1bb4fb680f34f7c9ad96a8f24ec88be73ea8e5a6c65260e9cb8a7",
    ],
  });
});

describe("sync protocol idempotency", () => {
  it("accepts only an exact replay for an existing operation id", () => {
    const existing = {
      clientDocumentId: "client-a",
      runUid: "11111111-1111-4111-8111-111111111111",
      eventKind: "snapshot" as const,
      payloadJson: '{"run":{}}',
      artifactDigest: "a".repeat(64),
    };
    expect(isExactRunPushReplay(existing, { ...existing })).toBe(true);
    expect(isExactRunPushReplay(existing, { ...existing, clientDocumentId: "client-b" })).toBe(false);
    expect(isExactRunPushReplay(existing, { ...existing, payloadJson: '{"run":{"changed":true}}' })).toBe(false);
  });
});

describe("run ownership authorization", () => {
  it("allows creation and same-principal writes while rejecting unowned tombstones and other principals", () => {
    expect(() => assertRunPrincipalAuthorization(null, "principal-a", "snapshot")).not.toThrow();
    expect(() => assertRunPrincipalAuthorization("principal-a", "principal-a", "snapshot")).not.toThrow();
    expect(() => assertRunPrincipalAuthorization("principal-a", "principal-a", "tombstone")).not.toThrow();
    expect(() => assertRunPrincipalAuthorization(null, "principal-a", "tombstone")).toThrow("no owner");
    expect(() => assertRunPrincipalAuthorization("principal-a", "principal-b", "snapshot")).toThrow("not authorized");
    expect(() => assertRunPrincipalAuthorization("principal-a", "principal-b", "tombstone")).toThrow("not authorized");
  });
});

function manifestJson(files: Array<{ path: string; size: number }> = [{ path: "source/main.ts", size: 12 }]) {
  return JSON.stringify({
    version: 1,
    files: files.map((file, index) => ({
      ...file,
      mode: 0o644,
      sha256: digest(String(index % 10)),
    })),
    totalExpandedBytes: files.reduce((total, file) => total + file.size, 0),
  });
}

function validFinalizeInput() {
  return {
    digest: digest("a"),
    sizeBytes: 15,
    manifestJson: manifestJson(),
    chunks: [
      { index: 0, storageId: "storage-a", sizeBytes: 10, sha256: digest("b") },
      { index: 1, storageId: "storage-b", sizeBytes: 5, sha256: digest("c") },
    ],
  };
}

function validMetadata() {
  return new Map([
    ["storage-a", { size: 10, sha256: digest("b") }],
    ["storage-b", { size: 5, sha256: digest("c") }],
  ]);
}

describe("sync protocol authentication", () => {
  it("parses one opaque bearer token without normalizing it", () => {
    expect(parseBearerToken("Bearer AbC-._~+/=09")).toBe("AbC-._~+/=09");
  });

  it.each([null, "", "Basic token", "Bearer", "Bearer ", "Bearer one two", "bearer token", " Bearer token"])(
    "rejects malformed authorization header %j",
    (header) => {
      expect(() => parseBearerToken(header)).toThrow("Authorization header must contain one Bearer token");
    },
  );
});

describe("sync protocol pull bounds", () => {
  it("defaults to the start of the ledger and a bounded page", () => {
    expect(parsePullBounds(null, null)).toEqual({ after: 0, limit: 100 });
  });

  it("accepts integer sequence and limit boundaries", () => {
    expect(parsePullBounds("0", "1")).toEqual({ after: 0, limit: 1 });
    expect(parsePullBounds("42", String(MAX_PULL_LIMIT))).toEqual({ after: 42, limit: MAX_PULL_LIMIT });
  });

  it.each([
    ["-1", "10"],
    ["1.5", "10"],
    ["1e2", "10"],
    ["9007199254740992", "10"],
    ["0", "0"],
    ["0", String(MAX_PULL_LIMIT + 1)],
    ["0", "2.5"],
  ])("rejects invalid sequence/limit bounds (%s, %s)", (after, limit) => {
    expect(() => parsePullBounds(after, limit)).toThrow("Invalid pull bounds");
  });
});

describe("artifact finalization validation", () => {
  it("accepts a strict manifest and contiguous chunks whose storage metadata matches", () => {
    expect(validateArtifactFinalize(validFinalizeInput(), validMetadata())).toEqual({
      ...validFinalizeInput(),
      manifest: {
        version: 1,
        files: [{ path: "source/main.ts", size: 12, mode: 0o644, sha256: digest("0") }],
        totalExpandedBytes: 12,
      },
    });
  });

  it("accepts the base64 SHA-256 representation returned by Convex storage metadata", () => {
    const artifactDigest = "1e82d03145bd1fd14c528a507ed8d038fd2561389f38f92f56916b633c1d5b9f";
    const input = {
      ...validFinalizeInput(),
      digest: artifactDigest,
      sizeBytes: 15,
      chunks: [{ index: 0, storageId: "storage-a", sizeBytes: 15, sha256: artifactDigest }],
    };
    const metadata = new Map([
      ["storage-a", { size: 15, sha256: "HoLQMUW9H9FMUopQftjQOP0lYTifOPkvVpFrYzwdW58=" }],
    ]);

    expect(validateArtifactFinalize(input, metadata)).toEqual({
      ...input,
      manifest: {
        version: 1,
        files: [{ path: "source/main.ts", size: 12, mode: 0o644, sha256: digest("0") }],
        totalExpandedBytes: 12,
      },
    });
  });

  it("rejects malformed artifact digests and unknown input fields", () => {
    expect(() =>
      validateArtifactFinalize({ ...validFinalizeInput(), digest: digest("A") }, validMetadata()),
    ).toThrow("Invalid artifact digest");
    expect(() =>
      validateArtifactFinalize({ ...validFinalizeInput(), reusableUrl: "https://example.invalid/secret" }, validMetadata()),
    ).toThrow("Invalid artifact finalization payload");
  });

  it("rejects manifests with unsafe, duplicate, or unsorted paths", () => {
    for (const files of [
      [{ path: "../escape", size: 1 }],
      [
        { path: "same", size: 1 },
        { path: "same", size: 1 },
      ],
      [
        { path: "z-last", size: 1 },
        { path: "a-first", size: 1 },
      ],
    ]) {
      expect(() =>
        validateArtifactFinalize({ ...validFinalizeInput(), manifestJson: manifestJson(files) }, validMetadata()),
      ).toThrow("Invalid artifact manifest");
    }
  });

  it("rejects non-contiguous or reordered chunks", () => {
    const input = validFinalizeInput();
    input.chunks[1]!.index = 2;
    expect(() => validateArtifactFinalize(input, validMetadata())).toThrow("Artifact chunks must be ordered 0..N-1");
  });

  it("enforces 64 chunks, 8 MiB chunks, and a 512 MiB artifact", () => {
    const tooMany = validFinalizeInput();
    tooMany.chunks = Array.from({ length: MAX_ARTIFACT_CHUNKS + 1 }, (_, index) => ({
      index,
      storageId: `storage-${index}`,
      sizeBytes: 1,
      sha256: digest("d"),
    }));
    expect(() => validateArtifactFinalize(tooMany, new Map())).toThrow("Artifact chunk count exceeds limit");

    const oversizedChunk = validFinalizeInput();
    oversizedChunk.chunks = [
      { index: 0, storageId: "storage-a", sizeBytes: MAX_CHUNK_BYTES + 1, sha256: digest("b") },
    ];
    oversizedChunk.sizeBytes = MAX_CHUNK_BYTES + 1;
    expect(() => validateArtifactFinalize(oversizedChunk, new Map())).toThrow("Invalid artifact chunk size");

    const oversizedArtifact = validFinalizeInput();
    oversizedArtifact.sizeBytes = MAX_ARTIFACT_BYTES + 1;
    expect(() => validateArtifactFinalize(oversizedArtifact, validMetadata())).toThrow("Invalid artifact size");
  });

  it("requires chunk sizes to sum to the artifact size", () => {
    expect(() =>
      validateArtifactFinalize({ ...validFinalizeInput(), sizeBytes: 16 }, validMetadata()),
    ).toThrow("Artifact chunk sizes do not match artifact size");
  });

  it("requires every storage object SHA-256 and size to match the claimed chunk", () => {
    const wrongHash = validMetadata();
    wrongHash.set("storage-b", { size: 5, sha256: digest("f") });
    expect(() => validateArtifactFinalize(validFinalizeInput(), wrongHash)).toThrow(
      "Stored chunk metadata does not match chunk 1",
    );

    const missing = validMetadata();
    missing.delete("storage-a");
    expect(() => validateArtifactFinalize(validFinalizeInput(), missing)).toThrow("Stored chunk 0 does not exist");
  });
});

describe("run push validation", () => {
  const runUid = "00000000-0000-4000-8000-000000000002";
  const artifactDigest = digest("e");
  const deletedAt = "2026-07-20T00:00:00.000Z";
  const snapshot = {
    version: 1,
    run: {
      runUid,
      originClientId: "00000000-0000-4000-8000-000000000003",
      benchmarkId: "sample",
      benchmarkName: "Sample",
      agentId: "codex",
      agentModel: null,
      reasoningEffort: null,
      serviceTier: null,
      runDurationMs: 42,
      solutionRelPath: "solutions/sample/run",
      artifactDigest,
      scoreModel: "manual",
      scorecardContent: "# Scorecard",
      scorecardData: {},
      metrics: {},
      notes: "",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
    },
  };
  const valid = {
    operationId: "00000000-0000-4000-8000-000000000001",
    runUid,
    eventKind: "snapshot",
    payloadJson: JSON.stringify(snapshot),
    artifactDigest,
  };

  it("accepts a schema-valid snapshot whose embedded identifiers match the operation", () => {
    expect(validateRunPush(valid)).toEqual(valid);
  });

  it("accepts a strict tombstone without an artifact", () => {
    const tombstone = {
      ...valid,
      eventKind: "tombstone",
      payloadJson: JSON.stringify({ version: 1, runUid, deletedAt }),
      artifactDigest: undefined,
    };
    expect(validateRunPush(tombstone)).toEqual(tombstone);
  });

  it.each([
    { ...valid, payloadJson: JSON.stringify({ ...snapshot, run: { ...snapshot.run, runUid: "11111111-1111-4111-8111-111111111111" } }) },
    { ...valid, payloadJson: JSON.stringify({ ...snapshot, run: { ...snapshot.run, artifactDigest: digest("f") } }) },
    { ...valid, payloadJson: JSON.stringify({ ...snapshot, run: { ...snapshot.run, scorecardData: [] } }) },
    { ...valid, payloadJson: JSON.stringify({ ...snapshot, run: { ...snapshot.run, unexpected: true } }) },
    { ...valid, payloadJson: JSON.stringify({ version: 1, runUid, deletedAt }), artifactDigest: undefined },
  ])("rejects malformed or mismatched snapshot payloads", (input) => {
    expect(() => validateRunPush(input)).toThrow("Invalid run push payload");
  });

  it.each([
    { ...valid, operationId: "alice" },
    { ...valid, runUid: "workstation.local" },
    { ...valid, eventKind: "delete" },
    { ...valid, payloadJson: "null" },
    { ...valid, payloadJson: "{broken" },
    { ...valid, artifactDigest: digest("E") },
    { ...valid, unexpected: true },
  ])("rejects invalid or identity-bearing operation payloads", (input) => {
    expect(() => validateRunPush(input)).toThrow("Invalid run push payload");
  });

  it("rejects malformed tombstones and tombstones that claim an artifact", () => {
    expect(() => validateRunPush({ ...valid, eventKind: "tombstone", payloadJson: JSON.stringify({ version: 1, runUid, deletedAt }) })).toThrow(
      "Tombstones cannot reference artifacts",
    );
    expect(() =>
      validateRunPush({
        ...valid,
        eventKind: "tombstone",
        payloadJson: JSON.stringify({ version: 1, runUid, deletedAt, unexpected: true }),
        artifactDigest: undefined,
      }),
    ).toThrow("Invalid run push payload");
    expect(() =>
      validateRunPush({
        ...valid,
        eventKind: "tombstone",
        payloadJson: JSON.stringify({ version: 1, runUid, deletedAt: "not-a-date" }),
        artifactDigest: undefined,
      }),
    ).toThrow("Invalid run push payload");
  });
});
