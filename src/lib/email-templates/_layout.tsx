import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

/**
 * Aloya editorial email shell.
 * Mediterranean palette, Bricolage Grotesque display, Geist body,
 * JetBrains Mono labels. No icons, no thin weights.
 *
 * Colors are hex (oklch is unsafe in mail clients).
 */
export const colors = {
  limestone: '#f6f1e7',
  limestoneSoft: '#f1ebdc',
  paper: '#fbf7ee',
  ink: '#1a1f1c',
  inkSoft: '#5b6058',
  line: '#e2dcc9',
  aegean: '#2c7892',
  aegeanDeep: '#1c5870',
  ochre: '#c98a2c',
  olive: '#3e4634',
}

const headerImg = 'https://aloya.cy/email/header.jpg'

interface LayoutProps {
  preview: string
  eyebrow: string
  headline: string
  children: React.ReactNode
}

export const Layout = ({ preview, eyebrow, headline, children }: LayoutProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <meta name="color-scheme" content="light only" />
      <meta name="supported-color-schemes" content="light" />
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Geist:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap"
        rel="stylesheet"
      />
    </Head>
    <Preview>{preview}</Preview>
    <Body style={body}>
      <Container style={container}>
        <Section style={topBar}>
          <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'baseline' }}>
                  <span style={wordmark}>Aloya</span>
                  <span style={wordmarkTag}>CY</span>
                </td>
                <td style={{ textAlign: 'right', verticalAlign: 'baseline' }}>
                  <span style={topMeta}>Cyprus · Transit</span>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Img
          src={headerImg}
          alt=""
          width={560}
          height={280}
          style={hero}
        />

        <Section style={contentWrap}>
          <Text style={eyebrowStyle}>{eyebrow}</Text>
          <Text style={headlineStyle}>{headline}</Text>
          <Hr style={rule} />
          {children}
        </Section>

        <Section style={footer}>
          <Hr style={footerRule} />
          <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
            <tbody>
              <tr>
                <td>
                  <Text style={footerBrand}>Aloya</Text>
                  <Text style={footerLine}>
                    Better bus journeys across Cyprus.
                  </Text>
                </td>
                <td style={{ textAlign: 'right', verticalAlign: 'top' }}>
                  <Link href="https://aloya.cy" style={footerLink}>
                    aloya.cy
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
          <Text style={footerFine}>
            Nicosia · Limassol · Larnaca · Paphos · Famagusta
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

/* ───────────── styles ───────────── */

const display =
  "'Bricolage Grotesque', 'Times New Roman', Georgia, serif"
const sans =
  "'Geist', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif"
const mono =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

const body: React.CSSProperties = {
  backgroundColor: '#ffffff',
  margin: 0,
  padding: '0',
  fontFamily: sans,
  color: colors.ink,
}

const container: React.CSSProperties = {
  width: '100%',
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: colors.paper,
  border: `1px solid ${colors.line}`,
}

const topBar: React.CSSProperties = {
  padding: '22px 32px 18px',
  borderBottom: `1px solid ${colors.line}`,
}

const wordmark: React.CSSProperties = {
  fontFamily: display,
  fontStyle: 'italic',
  fontWeight: 600,
  fontSize: '22px',
  letterSpacing: '-0.01em',
  color: colors.ink,
}

const wordmarkTag: React.CSSProperties = {
  fontFamily: mono,
  fontSize: '9px',
  letterSpacing: '0.22em',
  color: colors.inkSoft,
  marginLeft: '6px',
  verticalAlign: '3px',
}

const topMeta: React.CSSProperties = {
  fontFamily: mono,
  fontSize: '10px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: colors.inkSoft,
}

const hero: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: 'auto',
  maxWidth: '560px',
  objectFit: 'cover',
}

const contentWrap: React.CSSProperties = {
  padding: '40px 36px 32px',
}

const eyebrowStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: '11px',
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: colors.ochre,
  margin: '0 0 18px',
  fontWeight: 500,
}

const headlineStyle: React.CSSProperties = {
  fontFamily: display,
  fontSize: '36px',
  lineHeight: 1.08,
  letterSpacing: '-0.02em',
  fontWeight: 600,
  color: colors.ink,
  margin: '0 0 28px',
}

const rule: React.CSSProperties = {
  border: 'none',
  borderTop: `1px solid ${colors.line}`,
  margin: '0 0 28px',
}

const footer: React.CSSProperties = {
  padding: '24px 32px 32px',
  backgroundColor: colors.limestoneSoft,
}

const footerRule: React.CSSProperties = {
  border: 'none',
  borderTop: `1px solid ${colors.line}`,
  margin: '0 0 20px',
}

const footerBrand: React.CSSProperties = {
  fontFamily: display,
  fontStyle: 'italic',
  fontWeight: 600,
  fontSize: '18px',
  color: colors.ink,
  margin: '0 0 4px',
}

const footerLine: React.CSSProperties = {
  fontFamily: sans,
  fontSize: '13px',
  color: colors.inkSoft,
  margin: 0,
}

const footerLink: React.CSSProperties = {
  fontFamily: mono,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: colors.aegeanDeep,
  textDecoration: 'none',
}

const footerFine: React.CSSProperties = {
  fontFamily: mono,
  fontSize: '10px',
  letterSpacing: '0.16em',
  color: colors.inkSoft,
  margin: '24px 0 0',
  textTransform: 'uppercase',
}

/* ───────────── exported helpers ───────────── */

export const bodyText: React.CSSProperties = {
  fontFamily: sans,
  fontSize: '15px',
  lineHeight: 1.6,
  color: colors.ink,
  margin: '0 0 20px',
  fontWeight: 400,
}

export const bodyTextMuted: React.CSSProperties = {
  ...bodyText,
  color: colors.inkSoft,
  fontSize: '14px',
}

export const inlineLink: React.CSSProperties = {
  color: colors.aegeanDeep,
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  fontWeight: 500,
}

export const ctaButton: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: colors.ink,
  color: colors.paper,
  fontFamily: sans,
  fontSize: '14px',
  fontWeight: 600,
  letterSpacing: '0.02em',
  padding: '16px 28px',
  textDecoration: 'none',
  borderRadius: '2px',
}

export const ctaWrap: React.CSSProperties = {
  margin: '8px 0 32px',
}

export const codeBlock: React.CSSProperties = {
  fontFamily: mono,
  fontSize: '34px',
  fontWeight: 500,
  letterSpacing: '0.28em',
  color: colors.ink,
  backgroundColor: colors.limestone,
  border: `1px solid ${colors.line}`,
  padding: '24px 28px',
  textAlign: 'center' as const,
  margin: '0 0 28px',
}

export const sectionLabel: React.CSSProperties = {
  fontFamily: mono,
  fontSize: '10px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: colors.inkSoft,
  margin: '0 0 8px',
  fontWeight: 500,
}

export const fineprint: React.CSSProperties = {
  fontFamily: sans,
  fontSize: '12px',
  lineHeight: 1.6,
  color: colors.inkSoft,
  margin: '24px 0 0',
}
