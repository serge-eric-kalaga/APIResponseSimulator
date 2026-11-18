import type { Metadata } from "next";
import type { ReactNode } from "react";
import { appName } from "@/lab/brand";
import "./lab.css";
export const metadata: Metadata = {
  title: appName,
  applicationName: appName,
  description:
    "Console de simulation HTTP et de recette des notifications différées.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
