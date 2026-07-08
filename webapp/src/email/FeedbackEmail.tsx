import { Text, render } from "react-email";
import {
  TransactionalEmail,
  transactionalEmailMutedTextStyle,
  transactionalEmailTextStyle,
} from "./TransactionalEmail";

type FeedbackEmailProps = {
  id: string;
  message: string;
  route: string | null;
  section: string | null;
  lensName: string | null;
  lensColor: string | null;
  userName: string | null;
  userEmail: string | null;
  userAgent: string | null;
};

function value(value: string | null) {
  return value || "-";
}

function FeedbackMessage({ message }: { message: string }) {
  const lines = message.split("\n");
  return (
    <Text
      style={{
        ...transactionalEmailTextStyle,
        marginTop: "20px",
        marginBottom: 0,
        padding: "16px",
        border: "1px solid #DBE3E7",
        borderRadius: "8px",
        background: "#EDF3F6",
        whiteSpace: "pre-wrap",
      }}
    >
      {lines.map((line, index) => (
        <span key={index}>
          {line}
          {index < lines.length - 1 && <br />}
        </span>
      ))}
    </Text>
  );
}

export function FeedbackEmail(feedback: FeedbackEmailProps) {
  return (
    <TransactionalEmail
      title="New ActionAmp feedback"
      preview="New feedback was submitted in ActionAmp."
      footer="Internal ActionAmp notification."
    >
      <>
        <Text style={transactionalEmailTextStyle}>
          From: {feedback.userName || "Unknown"}
          {feedback.userEmail ? ` <${feedback.userEmail}>` : ""}
        </Text>
        <Text style={transactionalEmailMutedTextStyle}>
          Feedback ID: {feedback.id}
          <br />
          Route: {value(feedback.route)}
          <br />
          Section: {value(feedback.section)}
          <br />
          Lens: {value(feedback.lensName)}
          {feedback.lensColor ? ` (${feedback.lensColor})` : ""}
          <br />
          User agent: {value(feedback.userAgent)}
        </Text>
        <FeedbackMessage message={feedback.message} />
      </>
    </TransactionalEmail>
  );
}

export function renderFeedbackEmailHtml(feedback: FeedbackEmailProps) {
  return render(<FeedbackEmail {...feedback} />);
}
