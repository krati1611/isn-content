import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ISN Content Gen",
  description: "ISN Medical Content Automation UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
