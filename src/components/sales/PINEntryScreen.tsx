"use client";

import { useState, useEffect } from "react";
import { usePINVerification } from "@/app/sales/hooks/usePINVerification";

const PIN_LENGTH = 4;

export default function PINEntryScreen({ onVerified }: { onVerified: () => void }) {
  const [pin, setPin] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isShaking, setIsShaking] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const { verifyPin } = usePINVerification();

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handleVerify(pin);
    }
  }, [pin]);

  const handleVerify = async (currentPin: string) => {
    if (verifying) return;
    setVerifying(true);
    setErrorMsg("");

    const result = await verifyPin(currentPin);
    
    if (result.success) {
      onVerified();
    } else {
      setPin("");
      setErrorMsg(result.message || "Incorrect PIN");
      triggerShake();
    }
    setVerifying(false);
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleNumberClick = (num: string) => {
    if (pin.length < PIN_LENGTH) {
      setPin((prev) => prev + num);
      setErrorMsg("");
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg("");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Enter PIN</h1>
          <p className="text-sm text-gray-500">Please enter your agent PIN to access leads</p>
        </div>

        {/* PIN Display */}
        <div className={`flex justify-center gap-4 py-4 ${isShaking ? "animate-shake" : ""}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full ${
                i < pin.length ? "bg-emerald-600" : "bg-gray-200"
              } transition-colors duration-200`}
            />
          ))}
        </div>

        {/* Error Message */}
        <div className="h-6 text-center">
          {errorMsg && <p className="text-red-500 text-sm font-medium">{errorMsg}</p>}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-4 max-w-[280px] mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              onClick={() => handleNumberClick(num.toString())}
              disabled={verifying}
              className="w-16 h-16 rounded-full mx-auto bg-gray-50 text-gray-900 text-2xl font-medium hover:bg-gray-100 active:bg-gray-200 transition-colors flex items-center justify-center focus:outline-none"
            >
              {num}
            </button>
          ))}
          <div /> {/* Empty space for bottom left */}
          <button
            onClick={() => handleNumberClick("0")}
            disabled={verifying}
            className="w-16 h-16 rounded-full mx-auto bg-gray-50 text-gray-900 text-2xl font-medium hover:bg-gray-100 active:bg-gray-200 transition-colors flex items-center justify-center focus:outline-none"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            disabled={pin.length === 0 || verifying}
            className="w-16 h-16 rounded-full mx-auto text-gray-600 text-xl font-medium hover:bg-gray-100 active:bg-gray-200 transition-colors flex items-center justify-center focus:outline-none disabled:opacity-50"
            aria-label="Backspace"
          >
            <i className="ti ti-backspace text-2xl"></i>
          </button>
        </div>

        <div className="text-center pt-4">
          <a href="mailto:support@rba.in" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
            Forgot PIN?
          </a>
        </div>
      </div>
    </div>
  );
}

