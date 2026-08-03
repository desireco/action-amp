import { useEffect } from "react";

const PROJECT_ID = "13339807";
const SECURITY_CODE = "f345783e";
const SCRIPT_ID = "actionamp-statcounter";

/** Loads StatCounter only in production, keeping local development traffic out. */
export function StatCounter() {
  useEffect(() => {
    if (import.meta.env.DEV || document.getElementById(SCRIPT_ID)) return;

    window.sc_project = Number(PROJECT_ID);
    window.sc_invisible = 1;
    window.sc_security = SECURITY_CODE;

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = "https://www.statcounter.com/counter/counter.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  return null;
}

declare global {
  interface Window {
    sc_project?: number;
    sc_invisible?: number;
    sc_security?: string;
  }
}
