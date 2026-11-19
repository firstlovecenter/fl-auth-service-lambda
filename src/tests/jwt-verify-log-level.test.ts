/**
 * Unit tests for token-rejection log levels (SYN-260).
 *
 * Pure logic — no Neo4j/AWS required (secrets and the DB are mocked). An
 * expired or tampered token is the caller's input, not a server failure: a
 * password-reset link opened after its 24h lifetime must still answer 401, but
 * must log at WARN so it stops raising error tickets. A genuine failure (the
 * secret not loading) stays at ERROR.
 */

import jwt from "jsonwebtoken";
import type { Request, Response } from "express";

const mockTestSecret = "unit-test-secret";
let mockSecretFails = false;

jest.mock("../utils/secrets", () => ({
  getSecret: jest.fn(async (key: string) => {
    if (mockSecretFails) throw new Error("Secrets Manager unavailable");
    if (key === "JWT_SECRET") return mockTestSecret;
    throw new Error(`Secret not found: ${key}`);
  }),
  loadSecrets: jest.fn(async () => ({ JWT_SECRET: mockTestSecret })),
}));

const mockGetSession = jest.fn();
jest.mock("../db/neo4j", () => ({ getSession: () => mockGetSession() }));

// eslint-disable-next-line import/first
import { verifyJWT, InvalidTokenError } from "../utils/auth";
// eslint-disable-next-line import/first
import { setupPassword } from "../routes/setupPassword";
// eslint-disable-next-line import/first
import { ApiError, logLevelForError } from "../middleware/errorHandler";

/** A password-reset token whose 24h lifetime ended an hour ago. */
const expiredResetToken = () =>
  jwt.sign(
    {
      userId: "m1",
      email: "member@example.com",
      action: "password_reset",
      exp: Math.floor(Date.now() / 1000) - 3600,
    },
    mockTestSecret,
    { algorithm: "HS256" },
  );

/**
 * WARN/ERROR levels of the structured JSON lines written via console.log
 * (the one-off INFO "JWT_SECRET loaded" line is not a verification outcome).
 */
const loggedLevels = (log: jest.SpyInstance): string[] =>
  log.mock.calls
    .map(([line]) => {
      try {
        return JSON.parse(line).level;
      } catch {
        return undefined;
      }
    })
    .filter((level) => level === "WARN" || level === "ERROR");

describe("verifyJWT — rejected tokens (SYN-260)", () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    mockSecretFails = false;
    log = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it("throws InvalidTokenError and logs WARN for an expired token", async () => {
    await expect(verifyJWT(expiredResetToken())).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
    expect(loggedLevels(log)).toEqual(["WARN"]);
    const rejection = log.mock.calls
      .map(([line]) => JSON.parse(line))
      .find((entry) => entry.level === "WARN");
    expect(rejection.errorName).toBe("TokenExpiredError");
  });

  it("logs WARN for a token signed with the wrong secret", async () => {
    const forged = jwt.sign({ userId: "m1" }, "not-the-secret");
    const err = await verifyJWT(forged).catch((e) => e);

    expect(err).toBeInstanceOf(InvalidTokenError);
    expect(err.message).toBe("Invalid or expired token");
    expect(loggedLevels(log)).toEqual(["WARN"]);
  });

  it("keeps ERROR when the secret cannot be loaded", async () => {
    mockSecretFails = true;
    // The secret is cached per container, so load a fresh copy of the module
    // to exercise the very first (failing) load.
    let freshVerify: typeof verifyJWT = verifyJWT;
    jest.isolateModules(() => {
      freshVerify = require("../utils/auth").verifyJWT;
    });
    const err = await freshVerify(expiredResetToken()).catch((e) => e);

    expect(err.name).not.toBe("InvalidTokenError");
    expect(err.message).toBe("Invalid or expired token");
    expect(loggedLevels(log)).toEqual(["ERROR"]);
  });

  it("still verifies a valid token without logging", async () => {
    const token = jwt.sign({ userId: "m1" }, mockTestSecret, {
      expiresIn: "1h",
    });
    await expect(verifyJWT(token)).resolves.toMatchObject({ userId: "m1" });
    expect(log).not.toHaveBeenCalled();
  });
});

describe("POST /auth/setup-password with an expired link (SYN-260)", () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    mockSecretFails = false;
    mockGetSession.mockClear();
    log = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it("answers 401 and logs only at WARN", async () => {
    const req = {
      body: {
        email: "member@example.com",
        token: expiredResetToken(),
        password: "a-new-password",
      },
    } as unknown as Request;
    const next = jest.fn();

    setupPassword(req, {} as Response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    // The client keys its "link expired — use Forgot Password" copy on this.
    expect(err.message).toContain("expired");
    expect(logLevelForError(err)).toBe("warn");

    expect(loggedLevels(log)).toEqual(["WARN", "WARN"]);
    expect(mockGetSession).not.toHaveBeenCalled();
    // Never log the token (SYN-189).
    const token = (req.body as { token: string }).token;
    for (const [line] of log.mock.calls) expect(line).not.toContain(token);
  });
});

describe("logLevelForError — jsonwebtoken subclasses (SYN-260)", () => {
  it.each(["TokenExpiredError", "NotBeforeError"])(
    "logs a raw %s at warn",
    (name) => {
      const err = new Error("jwt expired");
      err.name = name;
      expect(logLevelForError(err)).toBe("warn");
    },
  );
});
