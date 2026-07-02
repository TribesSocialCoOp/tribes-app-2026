package app.tribes.android;

// Capacitor bridge for Google Play Age Signals (issue #32) — the Android analog of the
// iOS AgeRangePlugin. Exposes the OS age signal to the web layer as
// window.Capacitor.Plugins.AgeSignals.checkAgeSignals(). See:
//   - src/lib/age-verification/play-age-signals.ts (JS bridge)
//   - src/lib/services/age-verification/providers/play-age-signals.ts (server trust)
//
// Registered in MainActivity.onCreate via registerPlugin(AgeSignalsPlugin.class);
// Capacitor does not auto-discover app-local plugins.
//
// Requires the Play Age Signals SDK (com.google.android.play:age-signals) and the app to
// be distributed via Google Play to return live signals; a local/sideloaded build gets
// APP_NOT_OWNED. Signal values are simulated in tests via FakeAgeSignalsManager.
//
// Phase 2 (Play Integrity): the result here is not signed. Before this can stamp accounts
// in production, attach a Play Integrity token over the server `nonce` and verify it
// server-side (providers/play-age-signals.ts). Until then the server prod-rejects it.
//
// Symbols verified against age-signals:0.0.3: AgeSignalsVerificationStatus is an @IntDef
// in the `.model` subpackage (VERIFIED=0, SUPERVISED=1..DENIED=3, UNKNOWN=4, DECLARED=5);
// userStatus()/ageLower()/ageUpper() all return nullable Integer.

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.play.agesignals.AgeSignalsManager;
import com.google.android.play.agesignals.AgeSignalsManagerFactory;
import com.google.android.play.agesignals.AgeSignalsRequest;
import com.google.android.play.agesignals.model.AgeSignalsVerificationStatus;

@CapacitorPlugin(name = "AgeSignals")
public class AgeSignalsPlugin extends Plugin {

    @PluginMethod
    public void checkAgeSignals(PluginCall call) {
        try {
            AgeSignalsManager manager = AgeSignalsManagerFactory.create(getContext());
            manager.checkAgeSignals(AgeSignalsRequest.builder().build())
                .addOnSuccessListener(result -> {
                    JSObject ret = new JSObject();
                    Integer status = result.userStatus(); // @AgeSignalsVerificationStatus, nullable

                    // null = outside a covered region OR user chose not to share.
                    if (status == null) {
                        ret.put("available", false);
                        ret.put("noSignal", true);
                        call.resolve(ret);
                        return;
                    }

                    int s = status;
                    String statusName;
                    boolean supervised = false;
                    boolean noSignal = false;
                    if (s == AgeSignalsVerificationStatus.VERIFIED) {
                        statusName = "VERIFIED";
                    } else if (s == AgeSignalsVerificationStatus.DECLARED) {
                        statusName = "DECLARED";
                    } else if (s == AgeSignalsVerificationStatus.SUPERVISED) {
                        statusName = "SUPERVISED"; supervised = true;
                    } else if (s == AgeSignalsVerificationStatus.SUPERVISED_APPROVAL_PENDING) {
                        statusName = "SUPERVISED_APPROVAL_PENDING"; supervised = true;
                    } else if (s == AgeSignalsVerificationStatus.SUPERVISED_APPROVAL_DENIED) {
                        statusName = "SUPERVISED_APPROVAL_DENIED"; supervised = true;
                    } else {
                        statusName = "UNKNOWN"; noSignal = true; // in-jurisdiction but age unknown
                    }

                    if (noSignal) {
                        ret.put("available", false);
                        ret.put("noSignal", true);
                        ret.put("userStatus", statusName);
                        call.resolve(ret);
                        return;
                    }

                    Integer ageLower = result.ageLower();  // 0–18, nullable
                    Integer ageUpper = result.ageUpper();  // 2–18, or null when 18+
                    boolean over18 = (ageUpper == null);   // null upper bound = 18+

                    ret.put("available", true);
                    ret.put("over18", over18);
                    ret.put("userStatus", statusName);
                    ret.put("parentalControlsActive", supervised);
                    if (ageLower != null) ret.put("ageLower", ageLower.intValue());
                    if (ageUpper != null) ret.put("ageUpper", ageUpper.intValue());
                    // Phase 2: attach "integrityToken" from the Play Integrity API here.
                    call.resolve(ret);
                })
                .addOnFailureListener(e ->
                    call.reject("Age confirmation isn’t available on this device. Please update Google Play services and try again.", e));
        } catch (Exception e) {
            call.reject("Play Age Signals error.", e);
        }
    }
}
