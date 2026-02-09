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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Layout
    preview="You've been invited to Aloya."
    eyebrow="Personal invitation"
    headline="Come ride with us across Cyprus."
    heroImage="/__l5e/assets-v1/9ef7fea9-4058-4df1-ab28-52be4a0c2ee7/email-invite.jpg"
    heroAlt="Cream postcard tied with twine and a bougainvillea bloom"
  >
    <Text style={bodyText}>
      Someone thought you'd love Aloya — and we agree. Accept the
      invite to set up your account in under a minute.
    </Text>

    <div style={ctaWrap}>
      <Button style={ctaButton} href={confirmationUrl}>
        Accept invitation
      </Button>
    </div>

    <Text style={bodyTextMuted}>
      Curious first?{' '}
      <a href={siteUrl} style={inlineLink}>
        Have a look at aloya.cy
      </a>
      . If the button doesn't open, use the link below:
      <br />
      <a href={confirmationUrl} style={inlineLink}>
        {confirmationUrl}
      </a>
    </Text>

    <Text style={fineprint}>
      Not expecting an invitation? You can safely ignore this email.
    </Text>
  </Layout>
)

export default InviteEmail
