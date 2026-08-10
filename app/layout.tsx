import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import sourceEvents from "./events.json";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  return {
    metadataBase,
    title: `Chronicle — ${sourceEvents.length} World History Events`,
    description: "Explore a serpentine timeline, study flashcards, take tests, and play games across 12,000 years of world history.",
    icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
    openGraph: {
      title: "Chronicle — Know what happened. Remember when.",
      description: `${sourceEvents.length} world history events in one interactive timeline and study set.`,
      type: "website",
      images: [{ url: "/og.png", width: 1731, height: 909, alt: "Chronicle world history study set" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Chronicle — Know what happened. Remember when.",
      description: `${sourceEvents.length} world history events in one interactive timeline and study set.`,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
