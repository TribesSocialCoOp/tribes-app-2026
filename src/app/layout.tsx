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
  title: 'Tribes.app',
  description: 'Connect and communicate with your tribes.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${oxanium.variable} ${geistMono.variable} font-sans antialiased flex flex-col min-h-screen`}>
        {children}
        <Toaster />
        <CookieConsent />
      </body>
    </html>
  );
}
