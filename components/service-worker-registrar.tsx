"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes the app installable to a
 * phone's home screen. Renders nothing.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In dev this just adds confusing caching behaviour to every reload.
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // Not fatal — the app works fine, it just isn't installable.
        console.error("Service worker registration failed:", err);
      });
    };

    // Wait for load so registration doesn't compete with the first render.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
