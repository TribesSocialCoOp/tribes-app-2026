import type {Metadata} from 'next';
import { Oxanium, Geist_Mono } from 'next/font/google'; // Changed Geist to Oxanium
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { CookieConsent } from "@/components/layout/cookie-consent";

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
  title: 'Tribes',
  description: 'Connect and communicate with your tribes.',
};

export const viewport = {
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
      <body className={`${oxanium.variable} ${geistMono.variable} font-sans antialiased flex flex-col min-h-screen`}>
        {/* Prevent FOUC: apply dark mode class before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('tribes-theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()` }} />
        {children}
        <Toaster />
        <CookieConsent />
      </body>
    </html>
  );
}
