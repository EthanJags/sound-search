import type { Metadata } from "next";
import { Inter, Work_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["700", "800"],
});

export const metadata: Metadata = {
  title: "Sound Similarity Search",
  description: "Search for sounds with your voice!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body
        className={`${inter.variable} ${inter.className} ${workSans.variable} antialiased`}
      >
        {children}
        <a
          href="https://buymeacoffee.com/ethanjagoda"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-white/80 backdrop-blur-sm border border-zinc-200/80 px-4 py-2.5 text-sm font-medium text-zinc-600 shadow-sm transition-transform hover:scale-105"
        >
          <img
            src="https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg"
            alt=""
            className="h-5 w-5"
          />
          Buy me a coffee
        </a>
      </body>
    </html>
  );
}
