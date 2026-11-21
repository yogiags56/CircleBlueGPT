import { createHash, createPublicKey, verify } from "node:crypto";

export interface P256PublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

function decodeCanonicalBase64Url(value: string, label: string): Buffer {
  if (!BASE64URL_32_BYTES.test(value)) throw new Error(`INVALID_${label}`);
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== value) {
    throw new Error(`INVALID_${label}`);
  }
  return decoded;
}

export function validateP256PublicJwk(input: unknown): P256PublicJwk {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("INVALID_PUBLIC_KEY");
  }
  const value = input as Record<string, unknown>;
  const allowed = new Set(["kty", "crv", "x", "y"]);
  if (Object.keys(value).some(key => !allowed.has(key)) ||
      value.kty !== "EC" || value.crv !== "P-256" ||
      typeof value.x !== "string" || typeof value.y !== "string") {
    throw new Error("INVALID_PUBLIC_KEY");
  }
  decodeCanonicalBase64Url(value.x, "PUBLIC_KEY_X");
  decodeCanonicalBase64Url(value.y, "PUBLIC_KEY_Y");
  const jwk = { kty: "EC" as const, crv: "P-256" as const, x: value.x, y: value.y };
  try {
    createPublicKey({ key: jwk, format: "jwk" });
  } catch {
    throw new Error("INVALID_PUBLIC_KEY");
  }
  return jwk;
}

/** RFC 7638 thumbprint for an EC P-256 public JWK. */
export function p256JwkThumbprint(input: unknown): string {
  const jwk = validateP256PublicJwk(input);
  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y
  });
  return createHash("sha256").update(canonical, "utf8").digest("base64url");
}

/** Verify a SHA-256 ECDSA signature encoded as canonical base64url DER. */
export function verifyP256Sha256(
  input: unknown,
  message: string | Buffer,
  signatureBase64Url: string
): boolean {
  const jwk = validateP256PublicJwk(input);
  if (typeof signatureBase64Url !== "string" ||
      !/^[A-Za-z0-9_-]{11,128}$/.test(signatureBase64Url)) {
    return false;
  }
  const signature = Buffer.from(signatureBase64Url, "base64url");
  if (signature.toString("base64url") !== signatureBase64Url ||
      signature.length < 8 || signature.length > 72) {
    return false;
  }

  try {
    const publicKey = createPublicKey({
      key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      format: "jwk"
    });
    return verify("sha256", Buffer.from(message), {
      key: publicKey,
      dsaEncoding: "der"
    }, signature);
  } catch {
    return false;
  }
}
