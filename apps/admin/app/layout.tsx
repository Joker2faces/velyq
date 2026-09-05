import type { ReactNode } from "react";
import type { Metadata } from "next";
import { translate } from "@velyq/ui";
import { getLocale } from "./locale";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `VELYQ — ${translate("adminConsoleName", locale)}` };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
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
