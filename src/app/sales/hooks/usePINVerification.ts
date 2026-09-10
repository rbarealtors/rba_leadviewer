import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function usePINVerification() {
  const [isPinVerified, setIsPinVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if sales_pin_verified cookie exists
    const verifyCookie = () => {
      const cookieExists = document.cookie.includes("sales_pin_verified=true");
      setIsPinVerified(cookieExists);
      setLoading(false);
    };

    verifyCookie();
  }, []);

  const verifyPin = async (pin: string) => {
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        setIsPinVerified(true);
        // Refresh to ensure cookie is read
        router.refresh();
        return { success: true };
      } else {
        const errorData = await res.json();
        return { success: false, message: errorData.message || "Incorrect PIN" };
      }
    } catch (error) {
      return { success: false, message: "Verification failed" };
    }
  };

  return { isPinVerified, loading, verifyPin };
}

