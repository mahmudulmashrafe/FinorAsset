const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://htprctghiarickxfeoqd.supabase.co";
const supabaseKey = "sb_publishable_tedw0rfJUca0aXjTpFkPRA_QaxjR4zU";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: accounts, error: err1 } = await supabase.from("accounts").select("*");
  const { data: envelopes, error: err2 } = await supabase.from("envelopes").select("*");
  const { data: allocations, error: err3 } = await supabase.from("envelope_allocations").select("*");
  const { data: txns, error: err4 } = await supabase.from("transactions").select("*").order("occurred_on", { ascending: false }).limit(10);

  console.log("=== ACCOUNTS ===");
  console.log(err1 || accounts);
  console.log("\n=== ENVELOPES ===");
  console.log(err2 || envelopes);
  console.log("\n=== ENVELOPE ALLOCATIONS ===");
  console.log(err3 || allocations);
  console.log("\n=== RECENT TRANSACTIONS ===");
  console.log(err4 || txns);
}

main();
