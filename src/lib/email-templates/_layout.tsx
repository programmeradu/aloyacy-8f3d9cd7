import * as React from "react";
import { Body, Container, Head, Html, Img, Link, Preview, Section, Text } from "@react-email/components";

/**
 * Aloya email shell, "Under the Kyrenia range".
 * Dawn skyline on top, night skyline at the foot: a day of riding.
 * Zodiak (display) and Satoshi (UI) from Fontshare, with heavy system
 * fallbacks for clients that block web fonts. No thin weights anywhere.
 * Hex colours only, tables for layout (mail client safe).
 */
export const colors = {
  page: "#EDE6DA",
  paper: "#F7F1E8",
  white: "#FFFFFF",
  ink: "#16143A",
  inkSoft: "#3E3B60",
  line: "#DCD3C4",
  violet: "#5B4BB0",
  night: "#0F1130",
  cream: "#F4EBD6",
  // legacy names kept so older templates keep compiling
  limestone: "#F7F1E8",
  aegeanDeep: "#5B4BB0",
  ochre: "#5B4BB0",
};

const ASSET_HOST = "https://app.aloya.cy";
const display = "Zodiak, Georgia, 'Times New Roman', serif";
const sans = "Satoshi, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

interface LayoutProps {
  preview: string;
  eyebrow: string;
  headline: string;
  /** Greek line under the headline (the app is bilingual). */
  greek?: string;
  /** Legacy prop, ignored: every email uses the Kyrenia dawn sky. */
  heroImage?: string;
  heroAlt?: string;
  children: React.ReactNode;
}

export const Layout = ({ preview, eyebrow, headline, greek, children }: LayoutProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <meta name="color-scheme" content="light only" />
      <meta name="supported-color-schemes" content="light" />
      <link
        href="https://api.fontshare.com/v2/css?f[]=zodiak@700,800&f[]=satoshi@500,700,900&display=swap"
        rel="stylesheet"
      />
    </Head>
    <Preview>{preview}</Preview>
    <Body style={body}>
      <Container style={container}>
        <Section style={brandRow}>
          <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
            <tbody>
              <tr>
                <td style={{ verticalAlign: "middle" }}>
                  <span style={wordmark}>Aloya</span>
                </td>
                <td style={{ textAlign: "right", verticalAlign: "middle" }}>
                  <span style={brandMeta}>Cyprus buses · <span style={greekFont}>ΛΕΩΦΟΡΕΙΑ</span></span>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section style={card}>
          <Img
            src={`${ASSET_HOST}/email/kyrenia-dawn.png`}
            alt="The Kyrenia range at dawn, seen from Nicosia"
            width={596}
            height={209}
            style={hero}
          />
          <Section style={content}>
            <Text style={eyebrowStyle}>{eyebrow}</Text>
            <Text style={headlineStyle}>{headline}</Text>
            {greek ? <Text style={greekStyle}>{greek}</Text> : null}
            {children}
          </Section>
        </Section>

        <Section style={footer}>
          <Img
            src={`${ASSET_HOST}/email/kyrenia-night.png`}
            alt=""
            width={600}
            height={120}
            style={footerImg}
          />
          <Section style={footerInner}>
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  <td style={{ verticalAlign: "top" }}>
                    <Text style={footerBrand}>Aloya</Text>
                    <Text style={footerLine}>Live buses across Cyprus.</Text>
                  </td>
                  <td style={{ textAlign: "right", verticalAlign: "top" }}>
                    <Link href="https://app.aloya.cy" style={footerLink}>
                      Open Aloya
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
            <Text style={footerFine}>Nicosia · Limassol · Larnaca · Paphos · Famagusta</Text>
          </Section>
        </Section>
      </Container>
    </Body>
  </Html>
);

/* Eight digits in two groups of four, on a solid ticket. Copies as one string. */
export const CodeTicket = ({ code, label, greekLabel }: { code?: string; label: string; greekLabel?: string }) => {
  const c = (code ?? "--------").replace(/\s/g, "");
  const a = c.slice(0, 4);
  const b = c.slice(4);
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: "4px 0 14px" }}>
      <tbody>
        <tr>
          <td style={ticket}>
            <div style={ticketLabel}>
              {label}
              {greekLabel ? <span style={greekFont}> · {greekLabel}</span> : null}
            </div>
            <div style={ticketCode}>
              {a}
              <span style={{ paddingLeft: "0.42em" }}>{b}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
};

/* Small solid chips, e.g. "15 min", "Single use". */
export const Chips = ({ items }: { items: string[] }) => (
  <table cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: "0 0 26px" }}>
    <tbody>
      <tr>
        {items.map((t, i) => (
          <td key={t} style={{ paddingRight: i < items.length - 1 ? "8px" : 0 }}>
            <span style={chip}>{t}</span>
          </td>
        ))}
      </tr>
    </tbody>
  </table>
);

/* ───────────── styles ───────────── */

/* Satoshi and Zodiak have no Greek; give Greek text a heavy system face. */
const greekFont: React.CSSProperties = { fontFamily: "'Helvetica Neue', Arial, sans-serif" };

const body: React.CSSProperties = {
  backgroundColor: colors.page,
  margin: 0,
  padding: "24px 12px 36px",
  fontFamily: sans,
  color: colors.ink,
  WebkitFontSmoothing: "antialiased",
};

const container: React.CSSProperties = { width: "100%", maxWidth: "600px", margin: "0 auto" };

const brandRow: React.CSSProperties = { padding: "0 8px 16px" };

const wordmark: React.CSSProperties = {
  fontFamily: display,
  fontWeight: 800,
  fontSize: "28px",
  letterSpacing: "-0.02em",
  color: colors.ink,
};

const brandMeta: React.CSSProperties = {
  fontFamily: sans,
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: colors.inkSoft,
};

const card: React.CSSProperties = {
  backgroundColor: colors.paper,
  border: `2px solid ${colors.ink}`,
  borderBottom: `7px solid ${colors.ink}`,
  borderRadius: "22px",
  overflow: "hidden",
};

const hero: React.CSSProperties = { display: "block", width: "100%", height: "auto" };

const content: React.CSSProperties = { padding: "30px 32px 34px" };

const eyebrowStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: "12px",
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: colors.violet,
  margin: "0 0 12px",
};

const headlineStyle: React.CSSProperties = {
  fontFamily: display,
  fontSize: "38px",
  lineHeight: 1.08,
  letterSpacing: "-0.02em",
  fontWeight: 800,
  color: colors.ink,
  margin: "0 0 8px",
};

const greekStyle: React.CSSProperties = {
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
  fontSize: "16px",
  fontWeight: 700,
  color: colors.inkSoft,
  margin: "0 0 22px",
};

const ticket: React.CSSProperties = {
  backgroundColor: colors.white,
  border: `2px solid ${colors.ink}`,
  borderBottom: `6px solid ${colors.ink}`,
  borderRadius: "18px",
  padding: "18px 20px 20px",
  textAlign: "center",
};

const ticketLabel: React.CSSProperties = {
  fontFamily: sans,
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: colors.inkSoft,
  marginBottom: "6px",
};

const ticketCode: React.CSSProperties = {
  fontFamily: display,
  fontSize: "50px",
  lineHeight: 1.05,
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: colors.ink,
  whiteSpace: "nowrap",
};

const chip: React.CSSProperties = {
  display: "inline-block",
  fontFamily: sans,
  fontSize: "13px",
  fontWeight: 900,
  color: colors.ink,
  backgroundColor: "#E7DFF5",
  border: `2px solid ${colors.ink}`,
  borderRadius: "10px",
  padding: "5px 11px",
};

const footer: React.CSSProperties = {
  backgroundColor: colors.night,
  borderRadius: "22px",
  overflow: "hidden",
  marginTop: "18px",
};

const footerImg: React.CSSProperties = { display: "block", width: "100%", height: "auto" };

const footerInner: React.CSSProperties = { padding: "4px 28px 26px" };

const footerBrand: React.CSSProperties = {
  fontFamily: display,
  fontWeight: 800,
  fontSize: "22px",
  color: colors.cream,
  margin: "0 0 4px",
};

const footerLine: React.CSSProperties = {
  fontFamily: sans,
  fontSize: "14px",
  fontWeight: 500,
  color: "#C9C3E6",
  margin: 0,
};

const footerLink: React.CSSProperties = {
  display: "inline-block",
  fontFamily: sans,
  fontSize: "14px",
  fontWeight: 900,
  color: colors.night,
  backgroundColor: colors.cream,
  borderRadius: "12px",
  padding: "10px 16px",
  whiteSpace: "nowrap",
  textDecoration: "none",
};

const footerFine: React.CSSProperties = {
  fontFamily: sans,
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#8F89B8",
  margin: "20px 0 0",
};

/* ───────────── exported helpers ───────────── */

export const bodyText: React.CSSProperties = {
  fontFamily: sans,
  fontSize: "17px",
  lineHeight: 1.55,
  color: colors.ink,
  margin: "0 0 20px",
  fontWeight: 500,
};

export const bodyTextMuted: React.CSSProperties = { ...bodyText, color: colors.inkSoft, fontSize: "15px" };

export const inlineLink: React.CSSProperties = {
  color: colors.violet,
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  fontWeight: 700,
};

export const ctaButton: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: colors.ink,
  color: colors.cream,
  fontFamily: sans,
  fontSize: "16px",
  fontWeight: 900,
  padding: "16px 26px",
  textDecoration: "none",
  borderRadius: "16px",
  borderBottom: "5px solid #000000",
};

export const ctaWrap: React.CSSProperties = { margin: "6px 0 28px" };

/** Legacy code style, kept for older templates. New templates use CodeTicket. */
export const codeBlock: React.CSSProperties = {
  fontFamily: display,
  fontSize: "48px",
  fontWeight: 800,
  letterSpacing: "0.1em",
  color: colors.ink,
  backgroundColor: colors.white,
  border: `2px solid ${colors.ink}`,
  borderBottom: `6px solid ${colors.ink}`,
  borderRadius: "18px",
  padding: "18px 20px",
  textAlign: "center" as const,
  margin: "0 0 24px",
};

export const sectionLabel: React.CSSProperties = {
  fontFamily: sans,
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: colors.inkSoft,
  margin: "0 0 8px",
};

export const fineprint: React.CSSProperties = {
  fontFamily: sans,
  fontSize: "14px",
  lineHeight: 1.55,
  color: colors.inkSoft,
  margin: "4px 0 0",
  fontWeight: 500,
};
