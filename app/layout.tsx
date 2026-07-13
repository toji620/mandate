import type { Metadata } from "next";
import Navigation from "./components/Navigation";

export const metadata: Metadata = {
  title: "Mandate",
  description: "Policy-to-permission control plane for AI agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Navigation />
        {children}
      </body>
    </html>
  );
}
