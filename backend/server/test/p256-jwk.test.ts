import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign
} from "node:crypto";
import {
  p256JwkThumbprint,
  validateP256PublicJwk,
  verifyP256Sha256
} from "../src/security/p256-jwk.js";

function fixture() {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const privateKey = pair.privateKey;
  const publicJwk = {
    kty: jwk.kty!,
    crv: jwk.crv!,
    x: jwk.x!,
    y: jwk.y!
  };
  return { privateKey, publicJwk };
}

test("P-256 JWK validation accepts a public-only canonical key", () => {
  const { publicJwk } = fixture();
  assert.deepEqual(validateP256PublicJwk(publicJwk), publicJwk);
});

test("P-256 thumbprint matches RFC 7638 canonical member ordering", () => {
  const { publicJwk } = fixture();
  const canonical = JSON.stringify({
    crv: publicJwk.crv,
    kty: publicJwk.kty,
    x: publicJwk.x,
    y: publicJwk.y
  });
  const expected = createHash("sha256").update(canonical).digest("base64url");
  assert.equal(p256JwkThumbprint(publicJwk), expected);
});

test("private or unexpected JWK members are rejected", () => {
  const { publicJwk } = fixture();
  assert.throws(
    () => validateP256PublicJwk({ ...publicJwk, d: "private-material" }),
    /INVALID_PUBLIC_KEY/
  );
  assert.throws(
    () => validateP256PublicJwk({ ...publicJwk, alg: "ES256" }),
    /INVALID_PUBLIC_KEY/
  );
});

test("malformed coordinate encoding is rejected", () => {
  const { publicJwk } = fixture();
  assert.throws(
    () => validateP256PublicJwk({ ...publicJwk, x: "not-a-coordinate" }),
    /INVALID_PUBLIC_KEY_X/
  );
});

test("well-formed coordinate bytes that do not form a P-256 point are rejected", () => {
  const coordinate = Buffer.alloc(32).toString("base64url");
  assert.throws(
    () => validateP256PublicJwk({ kty: "EC", crv: "P-256", x: coordinate, y: coordinate }),
    /INVALID_PUBLIC_KEY/
  );
});

test("valid P-256 SHA-256 DER signature verifies", () => {
  const { privateKey, publicJwk } = fixture();
  const message = "CORTANAGPT-ENROLL-V1\nchallenge\nnonce\nthumbprint";
  const signature = sign("sha256", Buffer.from(message), privateKey).toString("base64url");
  assert.equal(verifyP256Sha256(publicJwk, message, signature), true);
});

test("modified message and malformed signature are rejected", () => {
  const { privateKey, publicJwk } = fixture();
  const signature = sign("sha256", Buffer.from("original"), privateKey).toString("base64url");
  assert.equal(verifyP256Sha256(publicJwk, "modified", signature), false);
  assert.equal(verifyP256Sha256(publicJwk, "original", "not-a-signature"), false);
});
