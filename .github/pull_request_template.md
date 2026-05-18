# 🌌 Tribes.app — Pull Request Template

## 📝 Description

Please include a summary of the changes, the motivation, and the context.
List any dependencies or schema updates required for this change.

Fixes # (issue reference, if applicable)

---

## 🛠️ Type of Change

- [ ] 🚀 **New Feature**: A non-breaking change that adds new functionality.
- [ ] 🐛 **Bug Fix**: A non-breaking change that resolves an issue.
- [ ] 🛡️ **Security & Hardening**: Security updates, rate-limiting, or authorization fences.
- [ ] 📦 **Infra & CI/CD**: Changes to docker setup, Caddyfiles, Terraform, or workflows.
- [ ] 📝 **Documentation**: Changes to markdown guides or comments.
- [ ] 🧹 **Chore**: Dependency bumps, formatting, refactoring.

---

## 🔐 Cryptographic & Security Impact

Since Tribes is an **End-to-End Encrypted (E2EE)** application, please answer:
- [ ] Does this change affect how posts or messages are stored, retrieved, or encrypted?
- [ ] If yes, have you verified the `isPublic` check/guard (to prevent solo-founder plaintext leaks)?
- [ ] Have you tested the Key Vault or recovery flow?
- [ ] Are any new environment variables or credentials introduced? (Do NOT commit them to git).

---

## 🧪 Verification Plan

Please detail how you verified these changes. Include steps to reproduce or test commands:

### Automated Tests
- [ ] **Typecheck**: `npm run typecheck` passes.
- [ ] **Unit Tests**: `npm run test` passes.
- [ ] **E2E Tests**: `npx playwright test` passes.

### Manual Verification
- Describe how you tested the layout, responsiveness (mobile vs desktop), and user flows.

---

## 🏁 Checklist

- [ ] My code follows the style guidelines of this project.
- [ ] I have performed a self-review of my own code.
- [ ] I have commented my code, particularly in hard-to-understand areas.
- [ ] I have updated the documentation accordingly.
- [ ] My changes generate no new warnings or console errors.
- [ ] New and existing unit tests pass locally with my changes.
