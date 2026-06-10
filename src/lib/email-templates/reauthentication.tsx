import * as React from 'react'
import { Text } from '@react-email/components'
import {
  Layout,
  bodyText,
  codeBlock,
  fineprint,
  sectionLabel,
} from './_layout'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Layout
    preview="Your Aloya verification code."
    eyebrow="Verify it's you"
    headline="A short code to confirm your identity."
  >
    <Text style={bodyText}>
      Enter the code below in the Aloya app to continue. It's
      single-use and expires in a few minutes.
    </Text>

    <Text style={sectionLabel}>Verification code</Text>
    <Text style={codeBlock}>{token}</Text>

    <Text style={fineprint}>
      If you didn't request this code, you can safely ignore the
      message — no changes have been made to your account.
    </Text>
  </Layout>
)

export default ReauthenticationEmail
