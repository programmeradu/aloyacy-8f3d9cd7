// Type shims for code written against supabase-js. The D1 adapter returns
// loosely-typed rows, so these are intentionally `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseClient<_DB = any, _S = any> = any;
