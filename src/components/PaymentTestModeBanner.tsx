const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken?.startsWith("pk_test_")) return null;
  return (
    <div className="w-full bg-ochre-sun/30 border-b border-line px-4 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-ink">
      Test mode — payments are simulated.{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
        aria-label="Read the payments test mode documentation"
      >
        Read about test mode
      </a>
    </div>
  );
}
