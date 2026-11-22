import { createHash } from "node:crypto";
import { verifyP256Sha256, type P256PublicJwk } from "./p256-jwk.js";

export interface CortanaPopProofInput {
  method: string;
  pathAndQuery: string;
  body: Buffer;
  timestamp: string;
  proofJti: string;
  accessToken: string;
  signature: string;
  publicKey: P256PublicJwk;
  nowSeconds?: number;
  clockSkewSeconds?: number;
}

export type CortanaPopVerification =
  | { valid: true; canonicalMessage: string; proofJti: string }
  | { valid: false; reason: "INVALID_METHOD" | "INVALID_TARGET" | "INVALID_TIMESTAMP" |
      "TIMESTAMP_OUT_OF_WINDOW" | "INVALID_PROOF_ID" | "INVALID_ACCESS_TOKEN" | "INVALID_SIGNATURE" };

/**
 * Verifies the project's proposal-only CortanaPoP detached signature.
 * This is not RFC 9449 DPoP and must not be exposed on a public route until
 * the custom wire protocol receives independent cryptographic review.
 *
 * Callers must pass the exact raw request body bytes and the exact
 * origin-form path+query received by the trusted HTTP server.
 */
export function verifyCortanaPopProof(input: CortanaPopProofInput): CortanaPopVerification {
  const method = input.method;
  if (typeof method !== "string" || !/^[A-Z]{3,10}$/.test(method)) {
    return { valid: false, reason: "INVALID_METHOD" };
  }

  const target = input.pathAndQuery;
  if (typeof target !== "string" || target.length < 1 || target.length > 4096 ||
      !target.startsWith("/") || target.startsWith("//") ||
      /[\r\n#\s]/.test(target) || target.includes("://")) {
    return { valid: false, reason: "INVALID_TARGET" };
  }

  if (typeof input.timestamp !== "string" || !/^(0|[1-9][0-9]{0,11})$/.test(input.timestamp)) {
    return { valid: false, reason: "INVALID_TIMESTAMP" };
  }
  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = input.clockSkewSeconds ?? 60;
  if (!Number.isSafeInteger(now) || !Number.isInteger(skew) || skew < 0 || skew > 300 ||
      Math.abs(now - timestamp) > skew) {
    return { valid: false, reason: "TIMESTAMP_OUT_OF_WINDOW" };
  }

  if (typeof input.proofJti !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(input.proofJti)) {
    return { valid: false, reason: "INVALID_PROOF_ID" };
  }
  if (typeof input.accessToken !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(input.accessToken) ||
      Buffer.from(input.accessToken, "base64url").toString("base64url") !== input.accessToken) {
    return { valid: false, reason: "INVALID_ACCESS_TOKEN" };
  }
  if (!Buffer.isBuffer(input.body)) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }

  const bodyHash = createHash("sha256").update(input.body).digest("base64url");
  const tokenHash = createHash("sha256").update(input.accessToken, "utf8").digest("base64url");
  const canonicalMessage = [
    "CORTANAGPT-POP-V1",
    method,
    target,
    bodyHash,
    input.timestamp,
    input.proofJti,
    tokenHash
  ].join("\n");

  let valid = false;
  try {
    valid = verifyP256Sha256(input.publicKey, Buffer.from(canonicalMessage, "utf8"), input.signature);
  } catch {
    valid = false;
  }
  if (!valid) return { valid: false, reason: "INVALID_SIGNATURE" };
  return { valid: true, canonicalMessage, proofJti: input.proofJti };
}
