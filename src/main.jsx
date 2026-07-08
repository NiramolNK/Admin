import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// FIX (data-loss pass 2): surface unhandled promise rejections with their
// CONTENTS. Chrome collapses rejected plain objects (e.g. Supabase error
// objects) into an unexpandable "Uncaught (in promise) Object" line, which
// makes silent background failures — exactly the kind that precede data
// loss — impossible to diagnose from a screenshot.
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  try {
    console.error(
      "[unhandled rejection]",
      r?.message || r?.code || String(r),
      "| details:", JSON.stringify(r, Object.getOwnPropertyNames(Object(r) === r ? r : {})),
      "| stack:", r?.stack || "(none)"
    );
  } catch (_) {
    console.error("[unhandled rejection]", r);
  }
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
