"use client";

import { useState, useEffect } from "react";
import { CheckIcon } from "./icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if running in standalone PWA mode
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    
    setIsStandalone(standaloneMode);
    if (standaloneMode) {
      setIsInstalled(true);
    }

    // Check if iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for beforeinstallprompt (Android / Chromium)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.error("PWA install error:", err);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-xs">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">App Installation</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Install RBA Sales on your home screen for instant access
          </p>
        </div>
        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
          PWA
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100">
        {isStandalone || isInstalled ? (
          <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold border border-emerald-100">
            <CheckIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>App is installed and running in full-screen mode</span>
          </div>
        ) : deferredPrompt ? (
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Add to Home Screen
          </button>
        ) : isIOS ? (
          <div className="bg-slate-50 rounded-xl p-3.5 text-xs text-slate-600 border border-slate-200/60 space-y-2">
            <p className="font-semibold text-slate-900 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              How to install on iPhone / iPad:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-500 pl-0.5">
              <li>Tap the <span className="font-semibold text-slate-700">Share</span> button (box with arrow) in Safari.</li>
              <li>Scroll down and tap <span className="font-semibold text-slate-700">&quot;Add to Home Screen&quot;</span>.</li>
              <li>Tap <span className="font-semibold text-slate-700">&quot;Add&quot;</span> in the top right.</li>
            </ol>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <span>Open in Chrome or Safari to install as a native phone app</span>
            <span className="font-semibold text-slate-700">Ready</span>
          </div>
        )}
      </div>
    </div>
  );
}

