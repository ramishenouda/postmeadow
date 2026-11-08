import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, Newsreader } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Display serif for headlines and the wordmark: warm and a little soft. */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

/** Reading serif for publications that choose "serif". Designed for long text. */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // Resolves relative canonical and social-preview URLs. Static pages are built ahead of
  // time, so the Docker build takes APP_URL as a build argument (see Dockerfile).
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_TAGLINE,
  openGraph: { siteName: APP_NAME, type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
