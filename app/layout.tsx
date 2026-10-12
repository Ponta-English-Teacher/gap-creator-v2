import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gap Creator",
  description: "Create information-gap activities that give students a reason to communicate.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
