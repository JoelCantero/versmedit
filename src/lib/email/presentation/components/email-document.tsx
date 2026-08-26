import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { EMAIL_POLICY_PATHS } from "../constants";
import type { EmailBrand, EmailLocale } from "../types";
import { EmailAction, type EmailActionProps } from "./email-action";

export type EmailDocumentProps = {
  readonly locale: EmailLocale;
  readonly brand: EmailBrand;
  readonly previewText: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly supportLabel: string;
  readonly termsLabel: string;
  readonly privacyLabel: string;
  readonly legalLabel: string;
  readonly action?: Pick<
    EmailActionProps,
    "actionUrl" | "label" | "fallbackInstruction"
  >;
};

function localizedPolicyUrl(
  brand: EmailBrand,
  locale: EmailLocale,
  path: (typeof EMAIL_POLICY_PATHS)[keyof typeof EMAIL_POLICY_PATHS],
): string {
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  return new URL(`${localePrefix}${path}`, brand.canonicalOrigin).toString();
}

export function EmailDocument({
  locale,
  brand,
  previewText,
  heading,
  paragraphs,
  supportLabel,
  termsLabel,
  privacyLabel,
  legalLabel,
  action,
}: EmailDocumentProps) {
  const termsUrl = localizedPolicyUrl(
    brand,
    locale,
    EMAIL_POLICY_PATHS.terms,
  );
  const privacyUrl = localizedPolicyUrl(
    brand,
    locale,
    EMAIL_POLICY_PATHS.privacy,
  );

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={brandSectionStyle}>
            {brand.logoUrl ? (
              <Img
                alt={`${brand.productName} logo`}
                src={brand.logoUrl}
                width="160"
                style={logoStyle}
              />
            ) : null}
            <Text style={productNameStyle}>{brand.productName}</Text>
          </Section>

          <Heading as="h1" style={headingStyle}>
            {heading}
          </Heading>
          {paragraphs.map((paragraph, index) => (
            <Text key={`${index}-${paragraph}`} style={paragraphStyle}>
              {paragraph}
            </Text>
          ))}

          {action ? (
            <EmailAction
              {...action}
              primaryColor={brand.primaryColor}
              foreground={brand.actionForeground}
            />
          ) : null}

          <Section style={supportSectionStyle}>
            <Text style={supportTextStyle}>
              {supportLabel}{" "}
              <Link
                href={`mailto:${brand.supportEmail}`}
                style={inlineLinkStyle}
              >
                {brand.supportEmail}
              </Link>
            </Text>
          </Section>

          <Hr style={dividerStyle} />
          <Section style={footerStyle}>
            <Text style={legalTextStyle}>
              {legalLabel} {brand.productName}
            </Text>
            <Text style={policyTextStyle}>
              <Link href={termsUrl} style={footerLinkStyle}>
                {termsLabel}
              </Link>
              {" · "}
              <Link href={privacyUrl} style={footerLinkStyle}>
                {privacyLabel}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = {
  backgroundColor: "#F3F4F6",
  color: "#111827",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  margin: "0",
  padding: "32px 12px",
};

const containerStyle = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: "8px",
  boxSizing: "border-box" as const,
  margin: "0 auto",
  maxWidth: "600px",
  padding: "32px",
  width: "100%",
};

const brandSectionStyle = {
  margin: "0 0 28px",
};

const logoStyle = {
  display: "block",
  height: "auto",
  margin: "0 0 14px",
  maxHeight: "48px",
  maxWidth: "160px",
  objectFit: "contain" as const,
};

const productNameStyle = {
  color: "#111827",
  fontSize: "18px",
  fontWeight: "700",
  lineHeight: "24px",
  margin: "0",
  overflowWrap: "anywhere" as const,
};

const headingStyle = {
  color: "#111827",
  fontSize: "26px",
  fontWeight: "700",
  lineHeight: "34px",
  margin: "0 0 20px",
  overflowWrap: "anywhere" as const,
};

const paragraphStyle = {
  color: "#374151",
  fontSize: "16px",
  lineHeight: "25px",
  margin: "0 0 16px",
  overflowWrap: "anywhere" as const,
};

const supportSectionStyle = {
  backgroundColor: "#F9FAFB",
  borderRadius: "6px",
  margin: "28px 0 0",
  padding: "14px 16px",
};

const supportTextStyle = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "21px",
  margin: "0",
  overflowWrap: "anywhere" as const,
};

const inlineLinkStyle = {
  color: "#1D4ED8",
  textDecoration: "underline",
};

const dividerStyle = {
  borderColor: "#E5E7EB",
  margin: "28px 0 20px",
};

const footerStyle = {
  margin: "0",
};

const legalTextStyle = {
  color: "#6B7280",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0 0 10px",
  overflowWrap: "anywhere" as const,
};

const policyTextStyle = {
  color: "#6B7280",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0",
};

const footerLinkStyle = {
  color: "#4B5563",
  textDecoration: "underline",
};