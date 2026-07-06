//
//  AgeRangePlugin.swift
//  App
//
//  Capacitor bridge for Apple's Declared Age Range API (issue #32). Exposes the OS age
//  signal to the web layer as `window.Capacitor.Plugins.AgeRange.getDeclaredAgeRange()`.
//  See src/lib/age-verification/ios-declared-age.ts (JS side) and
//  src/lib/services/age-verification/providers/apple-declared-age.ts (server trust).
//
//  ⚠️ XCODE SETUP (one-time, not done by `cap sync`):
//    1. In Xcode, add this file AND MainViewController.swift to the **App** target
//       (they live in ios/App/App/; drag into the App group, check "App" under Target
//       Membership).
//    2. Registration is manual: MainViewController (set as the storyboard's root VC)
//       calls `bridge?.registerPluginInstance(AgeRangePlugin())`. Capacitor 8 does NOT
//       auto-discover app-local plugins — without MainViewController this plugin never
//       loads and `window.Capacitor.Plugins.AgeRange` is undefined.
//    3. Enable the "Declared Age Range" capability on the App ID in the Developer
//       portal; the entitlement is already in App.entitlements / App.staging.entitlements.
//    4. Requires the iOS 26.2 SDK (Xcode 26.2+). The runtime is gated to iOS 26.2, so
//       older devices resolve { available: false } and the gate stays blocked for them.
//
//  Phase 2 (App Attest): the result here is not cryptographically signed. Before this
//  can stamp accounts in production, wrap the response in a DCAppAttest assertion over
//  the server `nonce` and verify it server-side (providers/apple-declared-age.ts). Until
//  then the server prod-rejects an unattested result.
//

import Foundation
import Capacitor
import DeviceCheck
import CryptoKit
#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

@objc(AgeRangePlugin)
public class AgeRangePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgeRangePlugin"
    public let jsName = "AgeRange"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getDeclaredAgeRange", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "attestKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "assertNonce", returnType: CAPPluginReturnPromise)
    ]

    // ── App Attest (anti-forgery) ────────────────────────────────────────────────
    // Proves an age submission came from a genuine, unmodified instance of this app on
    // real Apple hardware. Server verifies via appattest-checker-node (app-attest.ts).
    // Not available on the Simulator (DCAppAttestService.isSupported == false).

    /// Generate a Secure-Enclave key and attest it over `challenge` (one-time per device).
    @objc func attestKey(_ call: CAPPluginCall) {
        guard let challenge = call.getString("challenge") else { call.reject("Missing challenge."); return }
        let service = DCAppAttestService.shared
        guard service.isSupported else { call.resolve(["supported": false]); return }
        service.generateKey { keyId, genErr in
            if let genErr = genErr { call.reject("generateKey failed.", nil, genErr); return }
            guard let keyId = keyId else { call.reject("generateKey returned no key."); return }
            // clientDataHash for attestation = SHA256(challenge) — the server passes the
            // raw challenge to verifyAttestation, which recomputes this internally.
            let clientDataHash = Data(SHA256.hash(data: Data(challenge.utf8)))
            service.attestKey(keyId, clientDataHash: clientDataHash) { attestation, attErr in
                if let attErr = attErr { call.reject("attestKey failed.", nil, attErr); return }
                guard let attestation = attestation else { call.reject("attestKey returned nothing."); return }
                call.resolve(["keyId": keyId, "attestation": attestation.base64EncodedString(), "supported": true])
            }
        }
    }

    /// Sign SHA256(payload) with the attested key `keyId` for one age submission.
    /// `payload` is the canonical claim string (nonce + age claims — built in
    /// app-attest-payload.ts) so the assertion attests the age result itself, not just
    /// nonce possession. `nonce` is accepted as a legacy alias for the same value.
    @objc func assertNonce(_ call: CAPPluginCall) {
        guard let keyId = call.getString("keyId"),
              let payload = call.getString("payload") ?? call.getString("nonce") else {
            call.reject("Missing keyId/payload."); return
        }
        let service = DCAppAttestService.shared
        guard service.isSupported else { call.reject("App Attest not supported on this device."); return }
        // clientDataHash for assertion = SHA256(payload) — must match the server's hash.
        let clientDataHash = Data(SHA256.hash(data: Data(payload.utf8)))
        service.generateAssertion(keyId, clientDataHash: clientDataHash) { assertion, err in
            if let err = err { call.reject("generateAssertion failed.", nil, err); return }
            guard let assertion = assertion else { call.reject("generateAssertion returned nothing."); return }
            call.resolve(["assertion": assertion.base64EncodedString()])
        }
    }

    /// Request the account's declared age band for an 18+ gate. Resolves with
    /// `{ available, over18?, declaration? }`. `available: false` means the OS API is
    /// unavailable (iOS < 26.2 / framework absent) or the person declined to share.
    @objc func getDeclaredAgeRange(_ call: CAPPluginCall) {
        #if canImport(DeclaredAgeRange)
        guard #available(iOS 26.2, *) else {
            call.resolve(["available": false])
            return
        }
        Task { @MainActor in
            guard let presenter = self.bridge?.viewController else {
                call.resolve(["available": false])
                return
            }
            do {
                // ageGates: 18 → we only need the 18+ boundary; the two optional extra
                // gates are unused. The system may override gates by region regulation.
                let response = try await AgeRangeService.shared.requestAgeRange(ageGates: 18, nil, nil, in: presenter)
                switch response {
                case .declinedSharing:
                    call.resolve(["available": false, "declined": true])
                case .sharing(let range):
                    let over18 = (range.lowerBound ?? 0) >= 18
                    // `activeParentalControls` is an OptionSet — non-empty means the
                    // device is a managed / child account (a strong minor signal the
                    // server can block on). `.description` is a human-readable list for
                    // diagnostics. We also surface the raw band for logging.
                    var payload: [String: Any] = [
                        "available": true,
                        "over18": over18,
                        "declaration": Self.normalize(range.ageRangeDeclaration),
                        "parentalControlsActive": !range.activeParentalControls.isEmpty,
                        "parentalControls": range.activeParentalControls.description
                        // Phase 2: add "appAttest": <assertion over call's nonce>.
                    ]
                    if let lb = range.lowerBound { payload["lowerBound"] = lb }
                    if let ub = range.upperBound { payload["upperBound"] = ub }
                    call.resolve(payload)
                @unknown default:
                    // A future OS adds a case we don't understand yet — fail safe to
                    // "unavailable" rather than guess at its meaning (never over-grant).
                    call.resolve(["available": false])
                }
            } catch {
                call.reject("Age range request failed.", nil, error)
            }
        }
        #else
        // Built without the iOS 26.2 SDK — feature unavailable.
        call.resolve(["available": false])
        #endif
    }

    #if canImport(DeclaredAgeRange)
    /// Map Apple's declaration to the normalized level the server policy checks
    /// (see CONFIRMED_DECLARATIONS in apple-declared-age.ts). Government-ID / payment
    /// checks (incl. guardian variants) are "confirmed"; self/guardian-declared are not.
    @available(iOS 26.2, *)
    private static func normalize(_ decl: AgeRangeService.AgeRangeDeclaration?) -> String {
        guard let decl else { return "unknown" }
        switch decl {
        case .selfDeclared: return "self_declared"
        case .guardianDeclared: return "guardian_declared"
        case .governmentIDChecked, .guardianGovernmentIDChecked: return "government_id"
        case .paymentChecked, .guardianPaymentChecked: return "payment"
        case .checkedByOtherMethod, .guardianCheckedByOtherMethod: return "other"
        @unknown default: return "unknown"
        }
    }
    #endif
}
