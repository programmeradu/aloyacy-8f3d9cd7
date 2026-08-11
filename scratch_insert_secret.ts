import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: "postgresql://postgres:Sammyone@5321@db.avqhsjeeckptbszrflva.supabase.co:5432/postgres"
  });
  
  await client.connect();
  
  try {
    // Generate a secure secret
    const secretValue = "super_secure_cron_secret_123456";
    
    // Check if it already exists
    const res = await client.query(`SELECT id FROM vault.decrypted_secrets WHERE name = 'aloya_cron_secret'`);
    if (res.rows.length > 0) {
      console.log("Secret already exists, updating...");
      await client.query(`UPDATE vault.secrets SET secret = $1 WHERE id = $2`, [secretValue, res.rows[0].id]);
    } else {
      console.log("Creating new secret...");
      await client.query(`SELECT vault.create_secret($1, 'aloya_cron_secret')`, [secretValue]);
    }
    console.log("Secret successfully set to:", secretValue);
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}

main();
