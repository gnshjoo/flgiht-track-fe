import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flight Tracker",
  description: "Live aircraft tracking on an interactive map",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
