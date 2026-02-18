# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub Issue
2. Send details to: security@openpollen.dev (or create a private security advisory on GitHub)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for the fix.

## Security Considerations

- **API Keys**: Never commit API keys or secrets. Use environment variables or `openpollen.json` (gitignored)
- **Plugins**: Only install trusted plugins. Plugins execute with the same permissions as OpenPollen
- **Skills**: Skills are SKILL.md files that instruct the AI model. Review skill content before enabling
- **Memory**: Memory data is stored locally in `~/.openpollen/`. Ensure proper file permissions
- **Network**: The gateway server should not be exposed to the public internet without proper authentication
