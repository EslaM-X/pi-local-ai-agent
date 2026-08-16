# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| `main` | ✔ Supported |
| `v1.0.x` | ✔ Supported |

## Reporting a Vulnerability

Do **not** disclose security vulnerabilities publicly. Report privately through
a **GitHub Security Advisory** on this repository.

Include the affected file, a description, reproduction steps, and a suggested
fix if possible.

## Design notes

- **Local-first by design.** Models and data stay on the user's machine or Pi
  Node; there is no default telemetry or third-party data path.
- **Keys are never committed.** Credentials are injected at runtime via
  environment variables.
- **SDK boundaries.** Identity flows through the Pi SDK; the agent never
  re-implements wallet or identity logic.
