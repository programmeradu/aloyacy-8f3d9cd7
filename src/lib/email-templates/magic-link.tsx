import * as React from "react";
import { Text } from "@react-email/components";
import { Chips, CodeTicket, Layout, bodyText, fineprint } from "./_layout";

interface MagicLinkEmailProps {
  siteName: string;
  confirmationUrl?: string;
  token?: string;
}

export const MagicLinkEmail = ({ token }: MagicLinkEmailProps) => (
  <Layout
    preview={token ? `${token} is your Aloya sign-in code.` : "Your Aloya sign-in code."}
    eyebrow="Sign in"
    headline="Here's your code."
    greek="Ο κωδικός σύνδεσής σας."
  >
    <Text style={bodyText}>
      Type these 8 digits into Aloya to sign in. Your saved stops and trips come with you.
    </Text>
    <CodeTicket code={token} label="Sign-in code" greekLabel="ΚΩΔΙΚΟΣ" />
    <Chips items={["Valid 15 min", "Single use"]} />
    <Text style={fineprint}>
      Didn't ask for this? Ignore it. Nobody can sign in without the code.
    </Text>
  </Layout>
);

export default MagicLinkEmail;
