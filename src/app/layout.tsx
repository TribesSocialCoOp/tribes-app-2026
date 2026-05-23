import type {Metadata, Viewport} from 'next';
import { Oxanium, Geist_Mono } from 'next/font/google'; // Changed Geist to Oxanium
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { CookieConsent } from "@/components/layout/cookie-consent";
import { PasskeyShimInitializer } from "@/components/providers/passkey-shim-initializer";

// Configure Oxanium font
const oxanium = Oxanium({
  variable: '--font-oxanium', // CSS variable for Oxanium
  subsets: ['latin'],
  display: 'swap', // Use swap for better performance and UX
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://tribes.app'),
  title: {
    default: 'Tribes',
    template: '%s | Tribes',
  },
  description: 'Connect and communicate with your tribes.',
  openGraph: {
    type: 'website',
    siteName: 'Tribes',
    title: 'Tribes',
    description: 'Connect and communicate with your tribes.',
    images: [{ url: '/api/og/default', width: 1200, height: 630, alt: 'Tribes' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tribes',
    description: 'Connect and communicate with your tribes.',
    images: ['/api/og/default'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent FOUC: apply dark mode class before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('tribes-theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()` }} />
        {/* Capacitor platform classes — must run synchronously before first CSS paint
            so that platform-specific rules (e.g. Android safe-area inset) apply immediately.
            Sets classes on <html> (not <body>) because <body> doesn't exist yet in <head>.
            The native-initializer useEffect also sets body classes for JS consumers (idempotent). */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var C=window.Capacitor;if(!C||!C.isNativePlatform||!C.isNativePlatform())return;var h=document.documentElement;h.classList.add('capacitor-native');var p=C.getPlatform&&C.getPlatform()||'web';if(p==='android')h.classList.add('capacitor-android');else if(p==='ios')h.classList.add('capacitor-ios')}catch(e){}})()` }} />
      </head>
      <body className={`${oxanium.variable} ${geistMono.variable} font-sans antialiased flex flex-col min-h-screen`}>
        <PasskeyShimInitializer />
        {children}
        <Toaster />
        <CookieConsent />
      </body>
    </html>
  );
}

