// Browser client. Supabase is gone: only `auth` remains (backed by the
// Aloya session endpoints, see src/lib/auth/client.ts). Data reads/writes go
// through server functions and /api/public routes.
import { auth } from "@/lib/auth/client";

export const supabase = { auth };
