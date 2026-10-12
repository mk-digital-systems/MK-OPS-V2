import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/providers/theme-provider";
import { QueryProvider } from "@/providers/query-provider";
import "./globals.css";
import { APP_NAME, APP_TAGLINE, SITE_URL } from "@/lib/constants/brand";

const siteFont = localFont({
  src: [
    { path: "../../public/fonts/Roboto-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/Roboto-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description:
    `${APP_NAME} — ${APP_TAGLINE}. Projeler, personel, puantaj, depo ve araçlar tek panelde.`,
  applicationName: APP_NAME,
  openGraph: { siteName: APP_NAME, locale: "tr_TR", type: "website", images: "/opengraph-image" },
  twitter: { card: "summary_large_image", images: "/opengraph-image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className={`${siteFont.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <Toaster richColors position="top-right" closeButton />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
