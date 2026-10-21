import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Integration Lab | API Playground",
  description: "A safe playground for WhatsApp Cloud API, Amazon S3, and Mailgun integrations.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
