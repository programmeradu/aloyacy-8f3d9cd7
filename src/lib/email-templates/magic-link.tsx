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

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <Layout
    preview="Your Aloya sign-in link is ready."
    eyebrow="Single-use sign-in"
    headline="Tap to continue to Aloya."
    heroImage="/__l5e/assets-v1/f79b2c1b-336f-4939-b36d-863768673a70/email-magiclink.jpg"
    heroAlt="Antique brass key on cream paper, sunlit limestone"
  >
    <Text style={bodyText}>
      No password required. This link signs you in on the device
      you opened it on, then disappears.
    </Text>

    <div style={ctaWrap}>
      <Button style={ctaButton} href={confirmationUrl}>
        Sign in to Aloya
      </Button>
    </div>

    <Text style={bodyTextMuted}>
      The link expires shortly for your safety. If the button
      doesn't work, use the address below:
      <br />
      <a href={confirmationUrl} style={inlineLink}>
        {confirmationUrl}
      </a>
    </Text>

    <Text style={fineprint}>
      If you didn't request this, you can safely ignore the message —
      no one can sign in without the link above.
    </Text>
  </Layout>
)

export default MagicLinkEmail
