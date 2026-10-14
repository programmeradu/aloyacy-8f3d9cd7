import * as React from "react";
import { Text } from "@react-email/components";
import { Chips, CodeTicket, Layout, bodyText, fineprint, inlineLink } from "./_layout";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl?: string;
  token?: string;
}

export const SignupEmail = ({ recipient, token }: SignupEmailProps) => (
  <Layout
    preview={token ? `${token} confirms your email for Aloya.` : "Confirm your email for Aloya."}
    eyebrow="Welcome aboard"
    headline="Confirm it's you."
    greek="Καλώς ήρθατε στην Aloya."
  >
    <Text style={bodyText}>
      Enter this code in Aloya to link{" "}
      <a href={`mailto:${recipient}`} style={inlineLink}>
        {recipient}
      </a>{" "}
      to your app. Everything you saved as a guest stays put.
    </Text>
    <CodeTicket code={token} label="Confirmation code" greekLabel="ΚΩΔΙΚΟΣ" />
    <Chips items={["Valid 15 min", "Single use"]} />
    <Text style={fineprint}>
      Didn't sign up? Ignore this email and nothing will change.
    </Text>
  </Layout>
);

export default SignupEmail;
