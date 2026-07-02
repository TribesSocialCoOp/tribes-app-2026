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
//    1. In Xcode, add this file to the **App** target (it lives in ios/App/App/;
//       drag it into the App group and check "App" under Target Membership).
//    2. Enable the "Declared Age Range" capability on the App ID in the Developer
//       portal; the entitlement is already in App.entitlements / App.staging.entitlements.
//    3. Requires the iOS 26.2 SDK (Xcode 26.2+). The runtime is gated to iOS 26.2, so
//       older devices resolve { available: false } and the gate stays blocked for them.
//
//  Phase 2 (App Attest): the result here is not cryptographically signed. Before this
//  can stamp accounts in production, wrap the response in a DCAppAttest assertion over
//  the server `nonce` and verify it server-side (providers/apple-declared-age.ts). Until
//  then the server prod-rejects an unattested result.
//

import Foundation
import Capacitor
#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

@objc(AgeRangePlugin)
public class AgeRangePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgeRangePlugin"
    public let jsName = "AgeRange"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getDeclaredAgeRange", returnType: CAPPluginReturnPromise)
    ]

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
                    call.resolve([
                        "available": true,
                        "over18": over18,
                        "declaration": Self.normalize(range.ageRangeDeclaration)
                        // Phase 2: add "appAttest": <assertion over call's nonce>.
                    ])
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
