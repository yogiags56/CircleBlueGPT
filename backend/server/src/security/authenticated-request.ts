import { timingSafeEqual } from "node:crypto";
import type { AuthenticatedSession, SessionScope } from "../session/token-repository.js";
import { verifyCortanaPopProof } from "./cortana-pop.js";
import { p256JwkThumbprint, validateP256PublicJwk, type P256PublicJwk } from "./p256-jwk.js";

export interface AuthenticatedRequestHeaders {
  authorization?: string;
  proof?: string;
  timestamp?: string;
  proofId?: string;
}

export interface AuthenticatedRequestInput {
  method: string;
  pathAndQuery: string;
  rawBody: Buffer;
  headers: AuthenticatedRequestHeaders;
  requiredScope: SessionScope;
  nowSeconds?: number;
}

export interface SessionAuthenticator {
  authenticate(accessToken: string): Promise<AuthenticatedSession | null>;
}

export interface ProofReplayClaimer {
  claim(sessionId: string, proofJti: string, ttlSeconds: number): Promise<boolean>;
}

export type AuthenticatedRequestResult =
  | { authenticated: true; session: AuthenticatedSession; proofJti: string }
  | { authenticated: false; code:
      "MISSING_AUTHORIZATION" | "INVALID_AUTHORIZATION" | "INVALID_PROOF_HEADERS" |
      "SESSION_NOT_ACTIVE" | "KEY_BINDING_MISMATCH" | "INVALID_PROOF" |
      "PROOF_REPLAYED" | "INSUFFICIENT_SCOPE" };

const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PROOF_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{11,128}$/;
const PROOF_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const TIMESTAMP_PATTERN = /^(0|[1-9][0-9]{0,11})$/;
const REPLAY_TTL_SECONDS = 300;

/**
 * Route-independent authentication pipeline for the proposal-only CortanaPoP
 * protocol. It must not be exposed publicly before independent protocol review.
 * The caller must provide exact raw body bytes and the trusted origin-form target.
 * Storage/network failures intentionally throw so the HTTP boundary can fail closed.
 */
export async function authenticateCortanaRequest(
  input: AuthenticatedRequestInput,
  sessions: SessionAuthenticator,
  replay: ProofReplayClaimer
): Promise<AuthenticatedRequestResult> {
  const authorization = input.headers.authorization;
  if (authorization === undefined) return { authenticated: false, code: "MISSING_AUTHORIZATION" };
  const match = /^CortanaPoP ([A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match || !ACCESS_TOKEN_PATTERN.test(match[1]!)) {
    return { authenticated: false, code: "INVALID_AUTHORIZATION" };
  }

  const signature = input.headers.proof;
  const timestamp = input.headers.timestamp;
  const proofId = input.headers.proofId;
  if (typeof signature !== "string" || !PROOF_SIGNATURE_PATTERN.test(signature) ||
      typeof timestamp !== "string" || !TIMESTAMP_PATTERN.test(timestamp) ||
      typeof proofId !== "string" || !PROOF_ID_PATTERN.test(proofId) ||
      !Buffer.isBuffer(input.rawBody)) {
    return { authenticated: false, code: "INVALID_PROOF_HEADERS" };
  }

  const session = await sessions.authenticate(match[1]!);
  if (!session) return { authenticated: false, code: "SESSION_NOT_ACTIVE" };

  let publicKey: P256PublicJwk;
  try {
    publicKey = validateP256PublicJwk(session.publicKeyJwk);
    const expectedThumbprint = Buffer.from(p256JwkThumbprint(publicKey), "utf8");
    const storedThumbprint = Buffer.from(session.publicKeyThumbprint, "utf8");
    if (expectedThumbprint.length !== storedThumbprint.length ||
        !timingSafeEqual(expectedThumbprint, storedThumbprint)) {
      return { authenticated: false, code: "KEY_BINDING_MISMATCH" };
    }
  } catch {
    return { authenticated: false, code: "KEY_BINDING_MISMATCH" };
  }

  const verified = verifyCortanaPopProof({
    method: input.method,
    pathAndQuery: input.pathAndQuery,
    body: input.rawBody,
    timestamp,
    proofJti: proofId,
    accessToken: match[1]!,
    signature,
    publicKey,
    ...(input.nowSeconds === undefined ? {} : { nowSeconds: input.nowSeconds })
  });
  if (!verified.valid) return { authenticated: false, code: "INVALID_PROOF" };

  // Claim only after signature and timestamp verification; Redis SET NX is atomic.
  if (!await replay.claim(session.sessionId, proofId, REPLAY_TTL_SECONDS)) {
    return { authenticated: false, code: "PROOF_REPLAYED" };
  }

  if (!session.scopes.includes(input.requiredScope)) {
    return { authenticated: false, code: "INSUFFICIENT_SCOPE" };
  }

  return { authenticated: true, session, proofJti: proofId };
}
