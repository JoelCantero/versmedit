import { Button, Link, Section, Text } from "@react-email/components";

import { BRAND_ACTION_APPEARANCE } from "../../../brand-action-appearance";

import type { EmailBrand } from "../types";

export type EmailActionProps = {
  readonly actionUrl: string;
  readonly label: string;
  readonly fallbackInstruction: string;
  readonly primaryColor: EmailBrand["primaryColor"];
  readonly foreground: EmailBrand["actionForeground"];
};

export function EmailAction({
  actionUrl,
  label,
  fallbackInstruction,
  primaryColor,
  foreground,
}: EmailActionProps) {
  return (
    <Section style={actionSectionStyle}>
      <Button
        data-primary-action="true"
        href={actionUrl}
        style={{
          ...buttonStyle,
          backgroundColor: primaryColor,
          color: foreground,
        }}
      >
        {label}
      </Button>
      <Text style={fallbackInstructionStyle}>{fallbackInstruction}</Text>
      <Link href={actionUrl} style={fallbackUrlStyle}>
        {actionUrl}
      </Link>
    </Section>
  );
}

const actionSectionStyle = {
  margin: "28px 0",
  textAlign: "left" as const,
};

const buttonStyle = {
  ...BRAND_ACTION_APPEARANCE.emailStyle,
  display: "inline-block",
  padding: "12px 20px",
  textDecoration: "none",
};

const fallbackInstructionStyle = {
  color: "#4B5563",
  fontSize: "14px",
  lineHeight: "21px",
  margin: "24px 0 6px",
};

const fallbackUrlStyle = {
  color: "#1D4ED8",
  display: "block",
  fontSize: "14px",
  lineHeight: "21px",
  overflowWrap: "anywhere" as const,
  textDecoration: "underline",
  wordBreak: "break-all" as const,
};
