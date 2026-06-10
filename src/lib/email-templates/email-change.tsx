import * as React from 'react'
import { Button, Text } from '@react-email/components'
import {
  Layout,
  bodyText,
  bodyTextMuted,
  ctaButton,
  ctaWrap,
  fineprint,
  inlineLink,
  sectionLabel,
  colors,
} from './_layout'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Layout
    preview="Confirm your new Aloya email."
    eyebrow="Account change"
    headline="Confirm your new email address."
  >
    <Text style={bodyText}>
      You requested to change the email on your Aloya account.
      Confirm the change to finish updating your sign-in.
    </Text>

    <table
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      role="presentation"
      style={{
        margin: '0 0 28px',
        border: `1px solid ${colors.line}`,
        backgroundColor: colors.limestone,
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.line}` }}>
            <Text style={sectionLabel}>From</Text>
            <Text style={{ ...bodyText, margin: 0, fontWeight: 500 }}>{oldEmail}</Text>
          </td>
        </tr>
        <tr>
          <td style={{ padding: '16px 20px' }}>
            <Text style={sectionLabel}>To</Text>
            <Text style={{ ...bodyText, margin: 0, fontWeight: 500 }}>{newEmail}</Text>
          </td>
        </tr>
      </tbody>
    </table>

    <div style={ctaWrap}>
      <Button style={ctaButton} href={confirmationUrl}>
        Confirm change
      </Button>
    </div>

    <Text style={bodyTextMuted}>
      If the button doesn't open, use this link:
      <br />
      <a href={confirmationUrl} style={inlineLink}>
        {confirmationUrl}
      </a>
    </Text>

    <Text style={fineprint}>
      Didn't request this change? Secure your account immediately
      by resetting your password.
    </Text>
  </Layout>
)

export default EmailChangeEmail
