import type { EmailBrand } from "@/lib/email/presentation/types";

export function createTestEmailBrand(productName: string): EmailBrand {
  return Object.freeze({
    productName,
    canonicalOrigin: "https://app.example.test",
    primaryColor: "#0057B8",
    actionForeground: "#FFFFFF",
    supportEmail: "support@example.test",
    legalName: "Example Workspace, S.L.",
    legalAddress: "123 Example Street, Example City",
    logoUrl: "https://assets.example.test/mail/logo.png",
  });
}
