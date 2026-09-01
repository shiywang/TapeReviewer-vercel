"use client";

import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import App from "@/spa/App";

// The whole product is the existing React Router SPA. Next.js just serves the
// shell for every non-/api path and hosts the API route handlers. We render the
// router only after mount so there is no server-side window access / hydration
// mismatch (BrowserRouter reads window.location).
export default function CatchAllPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-muted">
        Loading…
      </div>
    );
  }
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
