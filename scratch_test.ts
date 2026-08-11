import { createClient } from "@supabase/supabase-js";

async function run() {
  console.log("Creating client...");
  const supabase = createClient("https://avqhsjeeckptbszrflva.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsaXFmY2xrbmR2ZXZzbG1qd2x1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQ1ODc3NywiZXhwIjoyMDk1MDM0Nzc3fQ.WRONG_SIGNATURE");

  console.log("Inserting...");
  const t = Date.now();
  const { error } = await supabase.from("rt_snapshots").insert([{ route_id: "test", stop_id: "test", trip_id: "test", predicted_arrival: new Date().toISOString(), delay_sec: 0 }]);
  console.log("Insert returned in", Date.now() - t, "ms");
  console.log("Error:", error);
}

run().catch(console.error);
