/**
 * gen-test-link.js
 *
 * Generates a magic-link callback URL for testing the Performance Lab
 * auth handshake without the candidate portal.
 *
 * Usage:
 *   node --env-file=.env.local scripts/gen-test-link.js
 *
 * Edit ALICE_EMAIL and ATTEMPT_ID below before running.
 */

"use strict";

const { createClient } = require("@supabase/supabase-js");

const ALICE_EMAIL = "alice@example.com";
const ATTEMPT_ID  = "e5afc5f6-c873-452d-b70c-04bc33d3d1d3";
const LAB_URL     = process.env.EXAM_ENVIRONMENT_BASE_URL
  ?? "https://performance-lab-zeta.vercel.app";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  console.log(`\nGenerating magic link for ${ALICE_EMAIL}...`);

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: ALICE_EMAIL,
  });

  if (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }

  const token_hash = data.properties.hashed_token;
  const next       = `/exam/launch/${ATTEMPT_ID}`;
  const url        = `${LAB_URL}/api/auth/callback?token_hash=${token_hash}&next=${encodeURIComponent(next)}`;

  console.log("\n--- Paste this URL into your browser ---\n");
  console.log(url);
  console.log("\n----------------------------------------");
  console.log("Note: token expires in 1 hour.");
  console.log(`Attempt ID: ${ATTEMPT_ID}\n`);
}

main();
