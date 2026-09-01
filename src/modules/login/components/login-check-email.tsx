"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface LoginCheckEmailMessages {
  title: string;
  description: string;
  enterCode: string;
  backToLogin: string;
}

interface LoginCheckEmailProps {
  email: string;
  messages: LoginCheckEmailMessages;
  onEnterCode: () => void;
  onBack: () => void;
}

export function LoginCheckEmail({
  email,
  messages,
  onEnterCode,
  onBack,
}: LoginCheckEmailProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const [before, after] = messages.description.split("{email}");

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1 id="login-check-email-heading" ref={headingRef} tabIndex={-1}>
            {messages.title}
          </h1>
        </CardTitle>
        <CardDescription>
          {before}
          <strong className="font-medium break-all text-foreground">
            {email}
          </strong>
          {after}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button type="button" onClick={onEnterCode}>
          {messages.enterCode}
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          {messages.backToLogin}
        </Button>
      </CardContent>
    </Card>
  );
}
