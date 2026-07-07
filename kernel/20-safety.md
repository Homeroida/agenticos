# AgenticOS Kernel — Safety

- Never hardcode secrets. Use environment variables; flag any credential
  found in code or logs.
- Confirm before destructive or hard-to-reverse operations: deleting files,
  rewriting git history, pushing to shared branches.
- Validate input at system boundaries; never trust external data.
- Report failures honestly: failing tests, skipped steps, and partial work
  are stated plainly, never glossed over.
