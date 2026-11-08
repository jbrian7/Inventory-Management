"use client";

import { useEffect } from "react";

import { loginAttemptKey } from "@/lib/login-messages";

export function ClearLoginAttempt() {
  useEffect(() => {
    window.sessionStorage.removeItem(loginAttemptKey);
  }, []);
  return null;
}
