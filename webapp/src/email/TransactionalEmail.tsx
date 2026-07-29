import React, { type ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  render,
} from "react-email";

type TransactionalEmailProps = {
  title: string;
  preview?: string;
  children: ReactNode;
  cta?: {
    label: string;
    href: string;
  };
  footer?: ReactNode;
};

const colors = {
  bg: "#F9FCFE",
  surface: "#FDFFFF",
  border: "#DBE3E7",
  text: "#0F171C",
  textMuted: "#5B656A",
  teal: "#00B9E5",
  tealDark: "#008AC0",
};

const fontFamily =
  "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif";

export function TransactionalEmail({
  title,
  preview,
  children,
  cta,
  footer = "One task. Then the next.",
}: TransactionalEmailProps) {
  return (
    <Html lang="en">
      <Head />
      {preview && <Preview>{preview}</Preview>}
      <Body
        style={{
          margin: 0,
          padding: 0,
          background: colors.bg,
          color: colors.text,
          fontFamily,
        }}
      >
        <Container
          style={{
            width: "100%",
            maxWidth: "640px",
            margin: "0 auto",
            padding: "32px 16px",
          }}
        >
          <Section style={{ paddingBottom: "18px" }}>
            <table role="presentation" cellSpacing="0" cellPadding="0">
              <tbody>
                <tr>
                    <td
                      align="center"
                      valign="middle"
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "7px",
                        background: colors.tealDark,
                        color: colors.bg,
                        fontFamily,
                        fontSize: "17px",
                        lineHeight: "26px",
                        fontWeight: 700,
                      }}
                    >
                      &#10003;
                    </td>
                  <td
                    style={{
                      paddingLeft: "10px",
                      fontSize: "15px",
                      lineHeight: "20px",
                      fontWeight: 700,
                      color: colors.text,
                    }}
                  >
                    ActionAmp
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section
            style={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: "12px",
              padding: "38px 40px 36px",
              boxShadow: "0 10px 30px rgba(35, 44, 64, 0.08)",
            }}
          >
            <div
              style={{
                width: "42px",
                height: "3px",
                background: colors.teal,
                borderRadius: "3px",
                marginBottom: "26px",
              }}
            />
            <Heading
              as="h1"
              style={{
                margin: "0 0 18px",
                fontSize: "28px",
                lineHeight: "34px",
                fontWeight: 650,
                color: colors.text,
              }}
            >
              {title}
            </Heading>
            <Section
              style={{
                fontSize: "16px",
                lineHeight: "26px",
                fontWeight: 400,
                color: colors.text,
              }}
            >
              {children}
            </Section>
            {cta && (
              <Button
                href={cta.href}
                style={{
                  marginTop: "28px",
                  borderRadius: "8px",
                  background: colors.tealDark,
                  padding: "12px 18px",
                  fontSize: "15px",
                  lineHeight: "20px",
                  fontWeight: 600,
                  color: colors.bg,
                  textDecoration: "none",
                }}
              >
                {cta.label}
              </Button>
            )}
          </Section>

          <Text
            style={{
              margin: "18px 6px 0",
              fontSize: "13px",
              lineHeight: "20px",
              color: colors.textMuted,
            }}
          >
            {footer}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderTransactionalEmailHtml(
  props: TransactionalEmailProps,
) {
  return render(<TransactionalEmail {...props} />);
}

export const transactionalEmailTextStyle = {
  margin: "0 0 16px",
  fontSize: "16px",
  lineHeight: "26px",
  color: colors.text,
};

export const transactionalEmailMutedTextStyle = {
  ...transactionalEmailTextStyle,
  color: "#353F44",
};
