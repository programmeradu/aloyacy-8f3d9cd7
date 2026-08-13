// Supabase client for the Aloya mobile app.
//
// Same publishable (anon) credentials as the web build — both clients hit
// the same Lovable Cloud project, so a session minted on web and one on
// device map to the same auth.uid().
//
// Sessions persist via AsyncStorage; we disable URL-based session detection
// because RN has no window.location to parse.

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const CUSTOM_SUPABASE_URL = "https://avqhsjeeckptbszrflva.supabase.co";
const CUSTOM_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cWhzamVlY2twdGJzenJmbHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNjg5NTQsImV4cCI6MjEwMTk0NDk1NH0.UxSTJl2xlef_TOUXt8FiY3x4_dqJDu37bufUy3erM3c";

export const supabase = createClient(CUSTOM_SUPABASE_URL, CUSTOM_SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
