import * as React from 'react'
import { Text } from '@react-email/components'
import {
  Layout,
  bodyText,
  bodyTextMuted,
  codeBlock,
  fineprint,
  inlineLink,
  sectionLabel,
} from './_layout'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl?: string
  token?: string
}

export const SignupEmail = ({ recipient, token }: SignupEmailProps) => (
  <Layout
    preview="One step to start riding with Aloya."
    eyebrow="Welcome aboard"
    headline="Confirm your email and start moving."
    heroImage="/__l5e/assets-v1/c9eb3e6a-3aa4-4db4-8273-4f7fbaf02fef/email-signup.jpg"
    heroAlt="Olive branch on warm linen, Cyprus limestone"
  >
    <Text style={bodyText}>
      You're a tap away from smarter bus journeys across Cyprus —
      live arrivals, accurate transfers, and routes that actually
      make sense.
    </Text>

    <Text style={sectionLabel}>Confirmation code</Text>
    <div style={codeBlock}>{token ?? '------'}</div>

    <Text style={bodyTextMuted}>
      We're confirming{' '}
      <a href={`mailto:${recipient}`} style={inlineLink}>
        {recipient}
      </a>
      . Enter the code above in the app to finish signing in.
    </Text>

    <Text style={fineprint}>
      Didn't sign up for Aloya? You can safely ignore this message —
      no account will be created.
    </Text>
  </Layout>
)

export default SignupEmail
