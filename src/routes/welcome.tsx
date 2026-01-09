import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";
import { markOnboarded } from "@/lib/onboarding";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { writePass, readPass } from "@/lib/motion-pass";
import {
  getOrCreatePushSubscription,
  getDeviceId,
  shouldRegisterSW,
} from "@/lib/pwa";
import { saveSubscription } from "@/lib/push.functions";
import imgLocation from "@/assets/welcome-location.jpg";
import imgNotifications from "@/assets/welcome-notifications.jpg";
import imgCard from "@/assets/welcome-card.jpg";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome to Aloya" },
      {
        name: "description",
        content:
          "A short, calm welcome to Aloya — the smarter way to ride Cyprus buses.",
      },
    ],
  }),
  component: WelcomePage,
});

const TOTAL = 3;

function WelcomePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const finish = async () => {
    if (user) await markOnboarded(user.id);
    void navigate({ to: "/" });
  };

  const goNext = () => {
    if (step >= TOTAL - 1) {
      void finish();
      return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  };

  return (
    <div className="relative min-h-[100dvh] bg-limestone text-ink">
      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-5">
        <span className="font-display text-[20px] leading-none tracking-tight">
          {t("welcome.brand")}
        </span>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <button
            type="button"
            onClick={() => void finish()}
            aria-label={t("welcome.dismiss")}
            className="grid h-8 w-8 place-items-center rounded-full border border-ink/10 bg-white/60 text-ink/70 transition hover:text-ink"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-8 pt-20">
        {/* Stepper */}
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ink/45">
          <span className="tabular-nums">{String(step + 1).padStart(2, "0")}</span>
          <span className="block h-px flex-1 bg-ink/10" />
          <span className="tabular-nums">{String(TOTAL).padStart(2, "0")}</span>
        </div>

        {/* Slide */}
        <div
          key={step}
          className="flex flex-1 flex-col"
          style={{
            animation: `welcomeRise 480ms cubic-bezier(.2,.7,.2,1) both`,
          }}
        >
          {step === 0 && <LocationStep onNext={goNext} />}
          {step === 1 && <NotificationsStep onNext={goNext} />}
          {step === 2 && <CardStep onFinish={() => void finish()} />}
        </div>

        {/* Footer legal */}
        <footer className="mt-6 flex items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40">
          <a href="/privacy" className="hover:text-ink/70">{t("privacy.title")}</a>
          <span aria-hidden className="block h-px w-3 bg-ink/15" />
          <a href="/terms" className="hover:text-ink/70">{t("terms.title")}</a>
        </footer>
      </main>

      <style>{`@keyframes welcomeRise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

// ── Step 1 ────────────────────────────────────────────────────────────
function LocationStep({ onNext }: { onNext: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);

  const allow = async () => {
    setPending(true);
    try {
      await new Promise<void>((resolve) => {
        if (!("geolocation" in navigator)) return resolve();
        navigator.geolocation.getCurrentPosition(
          () => resolve(),
          () => resolve(),
          { timeout: 6000, maximumAge: 60000 },
        );
      });
    } finally {
      setPending(false);
      onNext();
    }
  };

  return (
    <StepShell
      eyebrow={t("welcome.loc.eyebrow")}
      title={t("welcome.loc.title")}
      body={t("welcome.loc.body")}
      image={imgLocation}
      imageAlt="Cyprus coastline at dawn with a single road tracing toward a marker"
      primary={
        <button
          type="button"
          onClick={() => void allow()}
          disabled={pending}
          className="w-full rounded-full bg-ink py-3.5 font-display text-[15px] text-limestone transition active:scale-[0.99] disabled:opacity-60"
        >
          {t("welcome.loc.cta")}
        </button>
      }
      secondary={
        <button
          type="button"
          onClick={onNext}
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink/55 hover:text-ink"
        >
          {t("welcome.loc.skip")}
        </button>
      }
    />
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────
function NotificationsStep({ onNext }: { onNext: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [installedOnly, setInstalledOnly] = useState(false);
  const save = useServerFn(saveSubscription);

  const enable = async () => {
    setPending(true);
    try {
      if (!shouldRegisterSW()) {
        setInstalledOnly(true);
        return;
      }
      const result = await getOrCreatePushSubscription();
      if (result.ok) {
        await save({
          data: { deviceId: getDeviceId(), subscription: result.subscription },
        });
      }
    } catch {
      // best-effort
    } finally {
      setPending(false);
      onNext();
    }
  };

  return (
    <StepShell
      eyebrow={t("welcome.notif.eyebrow")}
      title={t("welcome.notif.title")}
      body={installedOnly ? t("welcome.notif.installed") : t("welcome.notif.body")}
      image={imgNotifications}
      imageAlt="A folded paper bus ticket on a sunlit limestone tabletop with a small aqua dot"
      primary={
        <button
          type="button"
          onClick={() => void enable()}
          disabled={pending}
          className="w-full rounded-full bg-ink py-3.5 font-display text-[15px] text-limestone transition active:scale-[0.99] disabled:opacity-60"
        >
          {t("welcome.notif.cta")}
        </button>
      }
      secondary={
        <button
          type="button"
          onClick={onNext}
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink/55 hover:text-ink"
        >
          {t("welcome.notif.skip")}
        </button>
      }
    />
  );
}

// ── Step 3 ────────────────────────────────────────────────────────────
function CardStep({ onFinish }: { onFinish: () => void }) {
  const { t } = useI18n();
  const [raw, setRaw] = useState("");
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  const formatted = digits.replace(/(.{4})/g, "$1 ").trim();
  const valid = digits.length === 16;

  const save = () => {
    if (!valid) return;
    const current = readPass();
    writePass({ ...current, number: digits });
    onFinish();
  };

  return (
    <StepShell
      eyebrow={t("welcome.card.eyebrow")}
      title={t("welcome.card.title")}
      body={t("welcome.card.body")}
      image={imgCard}
      imageAlt="A hand holding a transit card up to a glowing reader, painterly"
      primary={
        <>
          <label className="block">
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              value={formatted}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={t("welcome.card.placeholder")}
              className="w-full rounded-2xl border border-ink/12 bg-white/70 px-4 py-3.5 font-mono text-[15px] tracking-[0.12em] text-ink placeholder:text-ink/35 focus:border-aegean focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={!valid}
            className="w-full rounded-full bg-ink py-3.5 font-display text-[15px] text-limestone transition active:scale-[0.99] disabled:opacity-40"
          >
            {t("welcome.card.cta")}
          </button>
        </>
      }
      secondary={
        <button
          type="button"
          onClick={onFinish}
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink/55 hover:text-ink"
        >
          {t("welcome.card.skip")}
        </button>
      }
    />
  );
}

// ── Shared layout ────────────────────────────────────────────────────
function StepShell({
  eyebrow,
  title,
  body,
  image,
  imageAlt,
  primary,
  secondary,
}: {
  eyebrow: string;
  title: string;
  body: string;
  image: string;
  imageAlt: string;
  primary: React.ReactNode;
  secondary: React.ReactNode;
}) {
  return (
    <>
      <div className="mt-5 overflow-hidden rounded-[28px] border border-ink/8 bg-white/40 shadow-[0_30px_60px_-40px_rgba(20,20,20,0.25)]">
        <img
          src={image}
          alt={imageAlt}
          width={1024}
          height={1280}
          className="aspect-[4/5] w-full object-cover"
        />
      </div>

      <div className="mt-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-aegean">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-display text-[28px] leading-[1.08] tracking-tight text-balance text-ink">
          {title}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink/65">{body}</p>
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 pt-6">
        <div className="flex w-full flex-col gap-3">{primary}</div>
        {secondary}
      </div>
    </>
  );
}
