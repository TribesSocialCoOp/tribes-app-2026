/**
 * @fileoverview Native vs Web passkey path regression tests.
 *
 * Guards the critical invariant: login/signup pages must use DIFFERENT
 * WebAuthn call paths for native (Capacitor) vs web (browser):
 *
 * - Native: CapacitorPasskey.getCredential() / .createCredential()
 *   (avoids getClientExtensionResults TypeError on WKWebView)
 * - Web: @simplewebauthn/browser startAuthentication() / startRegistration()
 *   (uses full WebAuthn browser API with proper ArrayBuffer handling)
 *
 * These tests prevent the recurring regression where fixing one platform
 * breaks the other.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function readSource(path: string): string {
  return readFileSync(path, 'utf-8');
}

/**
 * Extracts a function body from source code by matching braces.
 * Returns the source between the function declaration and its closing brace.
 */
function extractFunctionBody(source: string, functionName: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex(l => l.includes(functionName));
  if (startIdx === -1) throw new Error(`Function "${functionName}" not found`);

  let braceDepth = 0;
  let started = false;
  const bodyLines: string[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    for (const ch of lines[i]!) {
      if (ch === '{') { braceDepth++; started = true; }
      if (ch === '}') braceDepth--;
    }
    bodyLines.push(lines[i]!);
    if (started && braceDepth === 0) break;
  }

  return bodyLines.join('\n');
}

// ──────────────────────────────────────────────────────────────
// LOGIN PAGE TESTS
// ──────────────────────────────────────────────────────────────

describe('Login page — native vs web passkey paths', () => {
  const loginSource = readSource('src/app/(auth)/login/page.tsx');
  const handleLoginBody = extractFunctionBody(loginSource, 'async function handleLogin');

  // ── Web path guards ──────────────────────────────────

  it('web path uses startAuthentication from @simplewebauthn/browser', () => {
    // The import must exist
    expect(loginSource).toContain("import { startAuthentication } from \"@simplewebauthn/browser\"");
    // startAuthentication must be called in the handleLogin function
    expect(handleLoginBody).toContain('startAuthentication(');
  });

  it('web path calls startAuthentication with optionsJSON parameter', () => {
    expect(handleLoginBody).toContain('optionsJSON:');
  });

  it('web path is gated behind !isNative (else branch)', () => {
    // The web call must be inside an else block, NOT at the top level
    const lines = handleLoginBody.split('\n');
    const startAuthLine = lines.findIndex(l => l.includes('startAuthentication('));
    expect(startAuthLine).toBeGreaterThan(-1);

    // Find the nearest preceding "else" or "} else {"
    const precedingLines = lines.slice(0, startAuthLine).reverse();
    const elseLine = precedingLines.findIndex(l => l.includes('else'));
    expect(elseLine, 'startAuthentication must be inside an else branch').toBeGreaterThan(-1);
    expect(elseLine, 'else must be close to startAuthentication (within 5 lines)').toBeLessThan(5);
  });

  // ── Native path guards ───────────────────────────────

  it('native path uses CapacitorPasskey.getCredential() directly', () => {
    expect(handleLoginBody).toContain('CapacitorPasskey.getCredential(');
  });

  it('native path is gated behind isNative check', () => {
    const lines = handleLoginBody.split('\n');
    const getCredLine = lines.findIndex(l => l.includes('CapacitorPasskey.getCredential('));
    expect(getCredLine).toBeGreaterThan(-1);

    // Find the nearest preceding isNative check
    const precedingLines = lines.slice(0, getCredLine).reverse();
    const nativeCheckLine = precedingLines.findIndex(l => l.includes('isNative'));
    expect(nativeCheckLine, 'getCredential must be inside an isNative block').toBeGreaterThan(-1);
  });

  it('native path does NOT call startAuthentication', () => {
    // Extract just the native branch (between isNative and else)
    const lines = handleLoginBody.split('\n');
    const nativeBranchStart = lines.findIndex(l => l.includes('if (isNative)'));
    const elseBranch = lines.findIndex((l, i) => i > nativeBranchStart && l.trim().startsWith('} else'));

    expect(nativeBranchStart).toBeGreaterThan(-1);
    expect(elseBranch).toBeGreaterThan(nativeBranchStart);

    const nativeBranch = lines.slice(nativeBranchStart, elseBranch).join('\n');
    expect(nativeBranch).not.toContain('startAuthentication(');
  });

  it('native path does NOT call getClientExtensionResults as code', () => {
    // Verify no actual method calls to getClientExtensionResults exist.
    // Comments mentioning it are fine — we check for the method call syntax.
    const lines = handleLoginBody.split('\n');
    const codeCallLines = lines.filter(l => {
      const trimmed = l.trim();
      // Skip comments
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return false;
      return trimmed.includes('.getClientExtensionResults(');
    });
    expect(codeCallLines, 'No code should call .getClientExtensionResults()').toHaveLength(0);
  });

  // ── Both paths feed finishLoginAction ─────────────────

  it('both paths feed into the same finishLoginAction call', () => {
    expect(handleLoginBody).toContain('finishLoginAction(');
    // There should be exactly ONE finishLoginAction call (not duplicated per branch)
    const matches = handleLoginBody.match(/finishLoginAction\(/g);
    expect(matches?.length, 'finishLoginAction should be called exactly once').toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────
// SIGNUP PAGE TESTS
// ──────────────────────────────────────────────────────────────

describe('Signup page — native vs web passkey paths', () => {
  const signupSource = readSource('src/app/(auth)/signup/page.tsx');

  // ── Web path guards ──────────────────────────────────

  it('web path uses startRegistration from @simplewebauthn/browser', () => {
    expect(signupSource).toContain("import { startRegistration } from \"@simplewebauthn/browser\"");
    expect(signupSource).toContain('startRegistration(');
  });

  it('web path calls startRegistration with optionsJSON parameter', () => {
    expect(signupSource).toContain('optionsJSON: options');
  });

  it('web path is gated behind !isNative (else branch)', () => {
    const lines = signupSource.split('\n');
    // Find the actual code call, not comments mentioning it
    const startRegLine = lines.findIndex(l => {
      const trimmed = l.trim();
      if (trimmed.startsWith('//')) return false;
      return trimmed.includes('startRegistration(');
    });
    expect(startRegLine).toBeGreaterThan(-1);

    const precedingLines = lines.slice(0, startRegLine).reverse();
    const elseLine = precedingLines.findIndex(l => l.includes('} else'));
    expect(elseLine, 'startRegistration must be inside an else branch').toBeGreaterThan(-1);
    expect(elseLine, 'else must be close to startRegistration (within 5 lines)').toBeLessThan(5);
  });

  // ── Native path guards ───────────────────────────────

  it('native path uses CapacitorPasskey.createCredential() directly', () => {
    expect(signupSource).toContain('CapacitorPasskey.createCredential(');
  });

  it('native path is gated behind isNative check', () => {
    const lines = signupSource.split('\n');
    const createCredLine = lines.findIndex(l => l.includes('CapacitorPasskey.createCredential('));
    expect(createCredLine).toBeGreaterThan(-1);

    const precedingLines = lines.slice(0, createCredLine).reverse();
    const nativeCheckLine = precedingLines.findIndex(l => l.includes('isNative'));
    expect(nativeCheckLine, 'createCredential must be inside an isNative block').toBeGreaterThan(-1);
  });

  it('native path does NOT call startRegistration as code', () => {
    const lines = signupSource.split('\n');
    const nativeBranchStart = lines.findIndex((l, i) => l.includes('if (isNative)') && i > 200);
    const elseBranch = lines.findIndex((l, i) => i > nativeBranchStart && l.trim().startsWith('} else'));

    expect(nativeBranchStart).toBeGreaterThan(-1);
    expect(elseBranch).toBeGreaterThan(nativeBranchStart);

    const nativeBranch = lines.slice(nativeBranchStart, elseBranch);
    // Filter out comments — only check actual code lines
    const codeCallLines = nativeBranch.filter(l => {
      const trimmed = l.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      return trimmed.includes('startRegistration(');
    });
    expect(codeCallLines, 'No code in native branch should call startRegistration').toHaveLength(0);
  });

  // ── Both paths feed finishRegistrationAction ──────────

  it('both paths feed into the same finishRegistrationAction call', () => {
    expect(signupSource).toContain('finishRegistrationAction(');
  });
});

// ──────────────────────────────────────────────────────────────
// RESPONSE FORMAT COMPATIBILITY TESTS
// ──────────────────────────────────────────────────────────────

describe('CapacitorPasskey response format compatibility', () => {
  it('PasskeyAuthenticationCredential has all fields needed by finishAuthentication', () => {
    // Read the Capacitor plugin type definitions
    const defs = readSource('node_modules/@capgo/capacitor-passkey/dist/esm/definitions.d.ts');

    // The plugin's authentication response must have these fields
    // (same as @simplewebauthn/server's AuthenticationResponseJSON)
    expect(defs).toContain('interface PasskeyAuthenticationCredential');
    expect(defs).toContain('id: string');
    expect(defs).toContain('rawId: string');
    expect(defs).toContain("type: PasskeyCredentialType"); // 'public-key'
    expect(defs).toContain('clientExtensionResults: Record<string, unknown>');

    // The response sub-object must have the WebAuthn assertion fields
    expect(defs).toContain('interface PasskeyAuthenticatorAssertionResponseJSON');
    expect(defs).toContain('clientDataJSON: string');
    expect(defs).toContain('authenticatorData: string');
    expect(defs).toContain('signature: string');
    expect(defs).toContain('userHandle?: string | null');
  });

  it('PasskeyRegistrationCredential has all fields needed by finishRegistration', () => {
    const defs = readSource('node_modules/@capgo/capacitor-passkey/dist/esm/definitions.d.ts');

    expect(defs).toContain('interface PasskeyRegistrationCredential');
    expect(defs).toContain('interface PasskeyAuthenticatorAttestationResponseJSON');
    expect(defs).toContain('attestationObject: string');
  });

  it('plugin does NOT require getClientExtensionResults method', () => {
    const defs = readSource('node_modules/@capgo/capacitor-passkey/dist/esm/definitions.d.ts');

    // The plugin returns clientExtensionResults as a plain property,
    // NOT as a method. This is the whole point of using it directly.
    expect(defs).not.toContain('getClientExtensionResults()');
    expect(defs).not.toContain('getClientExtensionResults():');
  });
});

// ──────────────────────────────────────────────────────────────
// PASSKEY SHIM INITIALIZER TESTS
// ──────────────────────────────────────────────────────────────

describe('PasskeyShimInitializer — root layout mounting', () => {
  it('shim initializer is mounted in root layout', () => {
    const rootLayout = readSource('src/app/layout.tsx');
    expect(rootLayout).toContain('PasskeyShimInitializer');
  });

  it('shim initializer imports from correct location', () => {
    const rootLayout = readSource('src/app/layout.tsx');
    expect(rootLayout).toContain('passkey-shim-initializer');
  });

  it('shim initializer is gated behind isNative', () => {
    const shimSource = readSource('src/components/providers/passkey-shim-initializer.tsx');
    expect(shimSource).toContain('isNative');
    expect(shimSource).toContain('autoShimWebAuthn');
  });
});
