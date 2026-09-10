"use client";

import { useRouter } from "next/navigation";
import PINEntryScreen from "@/components/sales/PINEntryScreen";

export default function PINEntryScreenClientWrapper() {
  const router = useRouter();

  return <PINEntryScreen onVerified={() => router.refresh()} />;
}

