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
} from './_layout'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <Layout
    preview="Reset your Aloya password."
    eyebrow="Password recovery"
    headline="Let's get you back on the bus."
  >
    <Text style={bodyText}>
      We received a request to reset the password on your Aloya
      account. Choose a new one using the secure link below.
    </Text>

    <div style={ctaWrap}>
      <Button style={ctaButton} href={confirmationUrl}>
        Reset password
      </Button>
    </div>

    <Text style={bodyTextMuted}>
      The link expires shortly. If the button doesn't open, use:
      <br />
      <a href={confirmationUrl} style={inlineLink}>
        {confirmationUrl}
      </a>
    </Text>

    <Text style={fineprint}>
      Didn't ask to reset? Ignore this message and your password
      stays unchanged.
    </Text>
  </Layout>
)

export default RecoveryEmail
