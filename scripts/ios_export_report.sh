#!/bin/bash
# ==============================================================================
# ios_export_report.sh — Classify and report the outcome of
# `xcodebuild -exportArchive` for build_ios.sh.
#
# Sourced by build_ios.sh (not run directly). Kept separate so the reporting
# logic can be exercised against a sample log without a real archive/upload:
#
#   source scripts/ios_export_report.sh
#   ios_export_outcome build/ios/export.log 0 build/ios/ipa   # -> uploaded|exported|failed
#
# With ExportOptions.plist destination=upload, xcodebuild uploads straight to
# App Store Connect and writes NO .ipa. With destination=export it writes an
# .ipa into the export dir that must be uploaded separately (npm run ios:upload).
# ==============================================================================

# Colors (only define if the caller hasn't already)
GREEN="${GREEN:-\033[0;32m}"
RED="${RED:-\033[0;31m}"
YELLOW="${YELLOW:-\033[1;33m}"
CYAN="${CYAN:-\033[0;36m}"
NC="${NC:-\033[0m}"

# ios_export_outcome LOG EXIT_CODE EXPORT_DIR
# Prints one of: uploaded | exported | failed
ios_export_outcome() {
    local log="$1" exit_code="$2" export_dir="$3"

    if [ "$exit_code" -ne 0 ] || [ ! -f "$log" ] \
        || grep -q "EXPORT FAILED" "$log" \
        || ! grep -q "EXPORT SUCCEEDED" "$log"; then
        echo "failed"
    elif grep -qE "Upload succeeded|Uploaded App" "$log"; then
        echo "uploaded"
    elif [ -n "$(find "$export_dir" -name '*.ipa' -type f 2>/dev/null | head -1)" ]; then
        echo "exported"
    else
        # Export "succeeded" but neither uploaded nor produced an IPA.
        echo "failed"
    fi
}

# ios_export_report OUTCOME LOG EXPORT_DIR BUNDLE_ID VERSION BUILD_NUMBER TEAM_ID ARCHIVE_PATH [EXIT_CODE]
# Prints the Step 5 summary + final banner. Returns non-zero on failure.
ios_export_report() {
    local outcome="$1" log="$2" export_dir="$3" bundle_id="$4" version="$5" \
        build_number="$6" team_id="$7" archive_path="$8" exit_code="${9:-0}"

    case "$outcome" in
        uploaded)
            echo -e "   ${GREEN}✅ Uploaded to App Store Connect${NC}"
            echo ""
            echo "=== Step 5: Verification ==="
            echo "   📦 Bundle ID: $bundle_id"
            echo "   🏷️  Version: $version ($build_number)"
            echo "   👤 Team: $team_id"
            echo ""
            echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
            echo -e "${CYAN}║   ✅ Build Uploaded!                      ║${NC}"
            echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
            echo ""
            echo "   Build $version ($build_number) is now processing in App Store Connect."
            echo "   Approve it in TestFlight when the processing email arrives."
            echo "     https://appstoreconnect.apple.com"
            echo ""
            echo "   No manual upload needed (ExportOptions destination=upload)."
            echo "   Export log: $log"
            ;;
        exported)
            local ipa_file ipa_size
            ipa_file=$(find "$export_dir" -name '*.ipa' -type f | head -1)
            ipa_size=$(du -h "$ipa_file" | cut -f1)
            echo -e "   ${GREEN}✅ IPA exported: $ipa_file${NC}"
            echo ""
            echo "=== Step 5: Verification ==="
            echo "   📱 IPA Size: $ipa_size"
            echo "   📦 Bundle ID: $bundle_id"
            echo "   🏷️  Version: $version ($build_number)"
            echo "   👤 Team: $team_id"
            echo ""
            echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
            echo -e "${CYAN}║   ✅ Build Complete!                      ║${NC}"
            echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
            echo ""
            echo "   Upload to TestFlight:"
            echo "     Option A: npm run ios:upload"
            echo "     Option B: open -a Transporter $ipa_file"
            echo "     Option C: xcrun altool --upload-app -f $ipa_file -t ios -u YOUR_APPLE_ID -p @keychain:AC_PASSWORD"
            echo ""
            echo "   Or open the archive in Xcode to manually upload:"
            echo "     open $archive_path"
            ;;
        *)
            echo -e "${RED}❌ Export/upload failed for ${bundle_id}${NC}"
            if [ "$exit_code" -ne 0 ]; then
                echo "   xcodebuild -exportArchive exited with code $exit_code"
            fi
            if [ -f "$log" ]; then
                local errors
                errors=$(grep -iE "error|failed" "$log" | tail -20)
                if [ -n "$errors" ]; then
                    echo "   Errors from xcodebuild:"
                    echo "$errors" | sed 's/^/     /'
                elif [ "$exit_code" -eq 0 ] && grep -q "EXPORT SUCCEEDED" "$log"; then
                    echo "   xcodebuild reported success, but nothing was uploaded and no .ipa"
                    echo "   was written to $export_dir. Check destination in ExportOptions.plist."
                fi
                echo "   Full log: $log"
            fi
            echo "   Check the archive in Xcode: open $archive_path"
            return 1
            ;;
    esac
}
