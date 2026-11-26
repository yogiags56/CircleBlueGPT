# Legacy Cortana baseline

The original Microsoft Cortana Android 3.3.3.2876 APK is a forensic baseline only.

- Package: `com.microsoft.cortana`
- Version: `3.3.3.2876`
- Min API: 19
- Target API: 29
- SHA-256: `c8c3192bc29057dfc398f4cb8fa3bfc549422373e0688a4c6de993f37a233d6c`

The binary is intentionally not stored in this repository. Keep it in a controlled local archive, verify the hash before each audit, and never patch the only original copy.

Static inspection found Microsoft account/token and CSDK dependencies in the startup and conversation path. Removing or bypassing a sign-in screen alone does not create a valid anonymous session. Do not reuse legacy Microsoft tokens, embedded API keys or service headers.

Persona extraction and reverse-engineering notes should be documented separately from the original proprietary binary. Only commit material that is appropriate to redistribute.
