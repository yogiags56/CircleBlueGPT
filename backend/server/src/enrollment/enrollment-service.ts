import { EnrollmentChallengeRepository } from "./challenge-repository.js";
import { p256JwkThumbprint, validateP256PublicJwk, verifyP256Sha256 } from "../security/p256-jwk.js";
import { SessionTokenRepository, type IssuedSessionToken, type SessionScope } from "../session/token-repository.js";

export interface EnrollmentProofInput {
  challengeId: string;
  publicKeyJwk: unknown;
  signature: string;
}

export interface EnrollmentResult {
  sessionId: string;
  token: IssuedSessionToken;
}

/**
 * Completes first-time installation enrollment.
 * The nonce is consumed before proof validation so even an invalid proof cannot
 * probe or retry the same challenge. This service is not exposed as an HTTP route
 * until enrollment abuse controls and the CortanaPoP/enrollment protocol review pass.
 */
export class EnrollmentService {
  constructor(
    private readonly challenges: Pick<EnrollmentChallengeRepository, "consumeEnrollmentChallenge">,
    private readonly sessions: Pick<SessionTokenRepository, "createEnrolledSession">
  ) {}

  async enroll(input: EnrollmentProofInput): Promise<EnrollmentResult> {
    if (!input || typeof input !== "object" ||
        typeof input.challengeId !== "string" ||
        typeof input.signature !== "string") {
      throw new Error("INVALID_ENROLLMENT_PROOF");
    }

    const consumed = await this.challenges.consumeEnrollmentChallenge(input.challengeId);
    if (!consumed) throw new Error("ENROLLMENT_CHALLENGE_INVALID_OR_EXPIRED");

    const publicKeyJwk = validateP256PublicJwk(input.publicKeyJwk);
    const thumbprint = p256JwkThumbprint(publicKeyJwk);
    const canonical = [
      "CORTANAGPT-ENROLL-V1",
      "POST",
      "/v1/enroll",
      input.challengeId,
      consumed.nonce.toString("base64url"),
      thumbprint
    ].join("\n");

    if (!verifyP256Sha256(publicKeyJwk, canonical, input.signature)) {
      throw new Error("ENROLLMENT_PROOF_INVALID");
    }

    return this.sessions.createEnrolledSession(
      publicKeyJwk,
      thumbprint,
      ["chat:send", "session:revoke"] satisfies SessionScope[]
    );
  }
}
