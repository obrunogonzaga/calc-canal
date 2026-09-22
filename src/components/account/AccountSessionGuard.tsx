"use client";
import { useEffect } from "react";
export function AccountSessionGuard() {
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const response = await fetch("/api/auth/get-session", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (active && !data?.user?.emailVerified)
          window.location.replace("/entrar");
      } catch {
        /* Keep a temporary network error separate from an expired session. */
      }
    }
    function restored(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
      else void check();
    }
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", restored);
    return () => {
      active = false;
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", restored);
    };
  }, []);
  return null;
}
