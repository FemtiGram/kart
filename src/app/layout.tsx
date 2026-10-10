import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const GA_ID = "G-T8XDP59WNK";

// Nunito Sans is self-hosted (the same variable font files Google Fonts
// serves, OFL — see src/assets/fonts/OFL.txt) so the build never fetches
// fonts.googleapis.com: Turbopack fails the whole build when Google answers
// with extensionless /l/font URLs, which happens intermittently. Split by
// unicode-range like Google's CSS: latin is preloaded, latin-ext (Sami
// letters such as ŋ, š, č) only loads when a page uses those characters.
// The metric-matched fallback face lives in globals.css. One @font-face per
// weight the old setup declared (same file each time, downloaded once), so
// in-between weights like font-medium (500) still resolve to 400 as before.
// Both files are declared as the family "Nunito Sans" (exactly like Google's
// CSS), so globals.css names the font directly instead of chaining CSS
// variables: an undefined variable would invalidate font-family on <html>
// and drop the whole page to the browser's default serif (Times) whenever
// HTML and CSS come from different builds (open tab during a deploy, stale
// dev cache). --font-nunito-sans is kept for CSS from before the switch.
const nunitoLatin = localFont({
  src: [
    { path: "../assets/fonts/nunito-sans-latin.woff2", weight: "300" },
    { path: "../assets/fonts/nunito-sans-latin.woff2", weight: "400" },
    { path: "../assets/fonts/nunito-sans-latin.woff2", weight: "600" },
    { path: "../assets/fonts/nunito-sans-latin.woff2", weight: "700" },
    { path: "../assets/fonts/nunito-sans-latin.woff2", weight: "800" },
  ],
  variable: "--font-nunito-sans",
  adjustFontFallback: false,
  declarations: [{ prop: "font-family", value: "'Nunito Sans'" }, { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

const nunitoLatinExt = localFont({
  src: [
    { path: "../assets/fonts/nunito-sans-latin-ext.woff2", weight: "300" },
    { path: "../assets/fonts/nunito-sans-latin-ext.woff2", weight: "400" },
    { path: "../assets/fonts/nunito-sans-latin-ext.woff2", weight: "600" },
    { path: "../assets/fonts/nunito-sans-latin-ext.woff2", weight: "700" },
    { path: "../assets/fonts/nunito-sans-latin-ext.woff2", weight: "800" },
  ],
  variable: "--font-nunito-latin-ext",
  adjustFontFallback: false,
  preload: false,
  declarations: [{ prop: "font-family", value: "'Nunito Sans'" }, { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }],
});

export const metadata: Metadata = {
  title: {
    default: "Datakart",
    template: "%s — Datakart",
  },
  description: "Utforsk Norge gjennom åpne geodata. Boligpriser, energikart, prisvekst, ladestasjoner, inntekt, hytter og verneområder på interaktive kart.",
  metadataBase: new URL("https://www.datakart.no"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "nb_NO",
    siteName: "Datakart",
  },
  twitter: {
    card: "summary_large_image",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Datakart",
  url: "https://www.datakart.no",
  description: "Utforsk Norge gjennom åpne geodata. Boligpriser, energikart, prisvekst, ladestasjoner, inntekt, hytter og verneområder.",
  inLanguage: "nb",
  author: {
    "@type": "Person",
    name: "Anders Gram",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="no" className={`${nunitoLatin.variable} ${nunitoLatinExt.variable} h-full antialiased`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
