import type { Metadata } from "next";
import Vault from "@/components/accounting/Vault";
import "./vault.css";

export const metadata: Metadata = { title: "Accounting Document Vault | Integration Lab", robots: { index: false, follow: false } };

export default function StoragePage() { return <Vault />; }
