import { Fira_Code, IBM_Plex_Sans_Arabic, Inter } from "next/font/google";

// Shared by the public site and the Business OS root layouts.
// Inter leads (Latin); Arabic glyphs fall through to IBM Plex Sans Arabic.
export const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
export const plexArabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-plex-arabic", display: "swap" });
export const fira = Fira_Code({ subsets: ["latin"], weight: ["400"], variable: "--font-fira", display: "swap" });
export const fontVars = `${inter.variable} ${plexArabic.variable} ${fira.variable}`;
