import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HookIn",
  description: "Payment webhook monitoring and recovery for Vercel and Neon."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
