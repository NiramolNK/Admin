/** Utilities-only Tailwind for the Service CRM tab.
 *  preflight is OFF so Tailwind's base reset can NOT restyle the rest
 *  of NiRM (which is fully inline-styled). Only utility classes that
 *  actually appear in src are generated. */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};
