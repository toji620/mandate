import type { Metadata } from "next";

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
      <body>{children}</body>
    </html>
  );
}
