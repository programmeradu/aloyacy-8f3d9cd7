import * as React from 'react'
import { Text } from '@react-email/components'
import {
  Layout,
  bodyText,
  codeBlock,
  fineprint,
  sectionLabel,
} from './_layout'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl?: string
  token?: string
}

export const MagicLinkEmail = ({ token }: MagicLinkEmailProps) => (
  <Layout
    preview="Your Aloya sign-in code is ready."
    eyebrow="Single-use sign-in"
    headline="Your sign-in code."
    heroImage="/__l5e/assets-v1/f79b2c1b-336f-4939-b36d-863768673a70/email-magiclink.jpg"
    heroAlt="Antique brass key on cream paper, sunlit limestone"
  >
    <Text style={bodyText}>
      Enter this code in the Aloya app to finish signing in. It
      expires in a few minutes and can only be used once.
    </Text>

    <Text style={sectionLabel}>Sign-in code</Text>
    <div style={codeBlock}>{token ?? '------'}</div>

    <Text style={fineprint}>
      If you didn't request this, you can safely ignore the message —
      no one can sign in without the code above.
    </Text>
  </Layout>
)

export default MagicLinkEmail
