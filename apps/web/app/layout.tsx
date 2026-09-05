import type { ReactNode } from "react";
import type { Metadata } from "next";
import { translate } from "@velyq/ui";
import { getLocale } from "./locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "VELYQ — Sports Market Intelligence",
  description:
    "Traceable sports market intelligence: model probability against live prices, observed odds movement and a full trace behind every number.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Resolved on the server so the very first paint carries the correct
  // language for both the rendered copy and assistive technology.
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#main-content">
          {translate("navSkipToContent", locale)}
        </a>
        {children}
      </body>
    </html>
  );
}
