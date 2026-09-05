import type { ReactNode } from "react";
import type { Metadata } from "next";
import { translate } from "@velyq/ui";
import { getLocale } from "./locale";
import "./globals.css";

/**
 * Metadata follows the customer's language.
 *
 * A static English `metadata` export left the browser tab, and every share
 * preview, in English on a fully Greek page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: translate("metaTitle", locale),
    description: translate("metaDescription", locale),
  };
}

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
