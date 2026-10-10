import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://www.justyou.fyi";
const SHORT_DESCRIPTION =
  "A subscription AI app that traces personal patterns to their root and gives real guidance toward actually resolving them — not just reflecting.";
const LONG_DESCRIPTION =
  "Just You is a subscription AI app that helps people understand why they keep repeating the same patterns, and what to actually do about it. It traces a problem back to its real root — a family pattern, an internal conflict — instead of just reflecting feelings back, then offers real guidance toward actually resolving it. It remembers across conversations too.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Just You — Understand why. Know what to do next.",
  description: SHORT_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Just You",
  },
  icons: {
    icon: "/favicon-32.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Just You",
    description: LONG_DESCRIPTION,
    url: SITE_URL,
    siteName: "Just You",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Just You" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Just You",
    description: SHORT_DESCRIPTION,
    images: ["/og-image.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#14120f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Next's appleWebApp metadata only emits the modern
            mobile-web-app-capable tag -- older iOS Safari versions
            specifically look for this legacy vendor-prefixed one to enable
            full-screen (no browser chrome) when launched from the home
            screen. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,400&family=Karla:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
