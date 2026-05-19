package app.tribes.android;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();

        // Disable the native Android 12+ overscroll stretch effect.
        // Our custom PullToRefresh component handles the pull gesture in JS.
        WebView webView = getBridge().getWebView();
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
    }
}
