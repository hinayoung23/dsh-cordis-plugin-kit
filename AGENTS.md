# Cordis plugin quality automation

- Follow `cordis-kit.json` and the bundled rules available through `node bin/dsh-cordis-kit.js standards`.
- After editing plugin source, tests, package metadata, the DSH patch, or runtime config, run `node bin/dsh-cordis-kit.js checkpoint save .`.
- After lifecycle, service injection, configuration, event, or resource-management changes, run `node bin/dsh-cordis-kit.js checkpoint pre-push .`.
- Before handing work to the user, run `node bin/dsh-cordis-kit.js checkpoint pre-commit .`; use `pnpm quality:ci` for release-ready work.
- Do not bypass a failed gate. Report the failing stage and preserve `.cordis-kit/reports` for diagnosis.
