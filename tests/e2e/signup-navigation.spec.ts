import { expect, test } from "@playwright/test";

import {
  cleanupAuthenticatedUsers,
  installAuthSessionCookie,
  seedAuthenticatedUser,
} from "./helpers/authenticated-user";

const targets = [
  {
    locale: "en",
    home: "/",
    signup: "/signup",
    login: "/login",
    navigation: "Account navigation",
    signupLabel: "Sign up",
    loginLabel: "Login",
    nameLabel: "Name",
    emailLabel: "Email",
    prompt: "Already have an account?",
    promptAction: "Sign in",
  },
  {
    locale: "es",
    home: "/es",
    signup: "/es/signup",
    login: "/es/login",
    navigation: "Navegación de cuenta",
    signupLabel: "Registrarse",
    loginLabel: "Iniciar sesión",
    nameLabel: "Nombre",
    emailLabel: "Correo electrónico",
    prompt: "¿Ya tienes una cuenta?",
    promptAction: "Inicia sesión",
  },
  {
    locale: "ca",
    home: "/ca",
    signup: "/ca/signup",
    login: "/ca/login",
    navigation: "Navegació del compte",
    signupLabel: "Registra't",
    loginLabel: "Inicia sessió",
    nameLabel: "Nom",
    emailLabel: "Correu electrònic",
    prompt: "Ja tens un compte?",
    promptAction: "Inicia sessió",
  },
] as const;

test.afterEach(async () => {
  await cleanupAuthenticatedUsers();
});

test("keeps localized login and signup distinct without carrying form PII", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });

  for (const target of targets) {
    await page.goto(target.home);
    const navigation = page.getByRole("navigation", { name: target.navigation });
    const login = navigation.getByRole("link", { name: target.loginLabel });
    const signup = navigation.getByRole("link", { name: target.signupLabel });
    await expect(login).toHaveAttribute("href", target.login);
    await expect(signup).toHaveAttribute("href", target.signup);

    await signup.click();
    await expect(page).toHaveURL(new RegExp(`${target.signup}$`));
    const submittedName = "Private Person";
    const submittedEmail = `private-${target.locale}@example.test`;
    await page.getByRole("textbox", { name: target.nameLabel }).fill(submittedName);
    await page.getByRole("textbox", { name: target.emailLabel }).fill(submittedEmail);
    await expect(page.getByText(target.prompt)).toBeVisible();
    const promptLink = page
      .getByRole("main")
      .getByRole("link", { name: target.promptAction });
    await expect(promptLink).toHaveAttribute("href", target.login);
    await promptLink.click();
    await expect(page).toHaveURL(new RegExp(`${target.login}$`));
    expect(page.url()).not.toContain(encodeURIComponent(submittedName));
    expect(page.url()).not.toContain(encodeURIComponent(submittedEmail));
    expect(new URL(page.url()).search).toBe("");
  }
});

test("redirects authenticated visitors away from every localized signup route", async ({
  page,
  context,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser();
  await installAuthSessionCookie(
    context,
    seeded.sessionToken,
    baseURL ?? "http://127.0.0.1:3100",
  );

  for (const target of targets) {
    await page.goto(target.signup);
    await expect(page).toHaveURL(new RegExp(`${target.home.replace("/", "\\/")}$`));
    await expect(page.getByRole("navigation", { name: target.navigation })).toBeVisible();
  }
});