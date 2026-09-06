import React from "react";
import { Text, render } from "react-email";
import {
  TransactionalEmail,
  transactionalEmailMutedTextStyle,
  transactionalEmailTextStyle,
} from "../email/TransactionalEmail";

type MagicLoginEmailProps = {
  code: string;
  loginUrl: string;
};

export function MagicLoginEmail({ code, loginUrl }: MagicLoginEmailProps) {
  return (
    <TransactionalEmail
      title="Your ActionAmp sign-in code"
      preview={`Use code ${code} to sign in to ActionAmp.`}
      cta={{ label: "Sign in to ActionAmp", href: loginUrl }}
    >
      <>
        <Text style={transactionalEmailTextStyle}>
          Use this code to sign in:
        </Text>
        <Text
          style={{
            ...transactionalEmailTextStyle,
            margin: "20px 0",
            fontSize: "28px",
            fontWeight: 700,
            letterSpacing: "0.16em",
          }}
        >
          {code}
        </Text>
        <Text style={transactionalEmailMutedTextStyle}>
          It expires in 10 minutes. Or use the button above to sign in directly.
        </Text>
      </>
    </TransactionalEmail>
  );
}

export function renderMagicLoginEmailHtml(props: MagicLoginEmailProps) {
  return render(<MagicLoginEmail {...props} />);
}
