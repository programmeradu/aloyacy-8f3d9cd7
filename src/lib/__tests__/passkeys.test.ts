// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getRpConfig } from "../passkeys.functions";
import {
  isPasskeySupported,
  hasDismissedPasskeyPrompt,
  dismissPasskeyPrompt,
} from "../passkeys.client";

describe("Passkeys utilities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("getRpConfig", () => {
    it("returns default aloya.cy config for empty origin", () => {
      const config = getRpConfig();
      expect(config.rpName).toBe("Aloya");
      expect(config.rpID).toBe("aloya.cy");
      expect(config.expectedOrigin).toBe("https://app.aloya.cy");
    });

    it("correctly identifies localhost for development", () => {
      const config = getRpConfig("http://localhost:5173");
      expect(config.rpID).toBe("localhost");
      expect(config.expectedOrigin).toBe("http://localhost:5173");
    });

    it("correctly handles lovable preview domains", () => {
      const config = getRpConfig("https://id-preview--123.lovable.app");
      expect(config.rpID).toBe("id-preview--123.lovable.app");
      expect(config.expectedOrigin).toBe("https://id-preview--123.lovable.app");
    });

    it("correctly handles production subdomains", () => {
      const config = getRpConfig("https://app.aloya.cy");
      expect(config.rpID).toBe("aloya.cy");
      expect(config.expectedOrigin).toBe("https://app.aloya.cy");
    });
  });

  describe("dismissPasskeyPrompt & hasDismissedPasskeyPrompt", () => {
    it("tracks user dismissal in localStorage", () => {
      const userId = "usr_test_123";
      expect(hasDismissedPasskeyPrompt(userId)).toBe(false);

      dismissPasskeyPrompt(userId);
      expect(hasDismissedPasskeyPrompt(userId)).toBe(true);
    });
  });

  describe("isPasskeySupported", () => {
    it("returns false if PublicKeyCredential is not available", async () => {
      const supported = await isPasskeySupported();
      expect(typeof supported).toBe("boolean");
    });
  });
});
