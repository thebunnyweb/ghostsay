# Security policy

ghostsay only draws to your terminal: it makes no network requests, reads no files besides its
own, and has no runtime dependencies.

**Please do not open public issues for vulnerabilities.** Use GitHub's private vulnerability
reporting (Security → Report a vulnerability) on this repository.

Releases are published from GitHub Actions with npm provenance, so you can check that a version
on npm was built from this repository (`npm audit signatures`).
