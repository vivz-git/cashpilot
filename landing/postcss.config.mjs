/**
 * Empty on purpose: this app uses plain CSS, no PostCSS plugins.
 *
 * Needed so Next.js doesn't walk up to the repo root and pick up the
 * main CashPilot app's postcss.config.mjs (which requires
 * @tailwindcss/postcss, not installed here).
 */
const config = {
  plugins: {},
};

export default config;
