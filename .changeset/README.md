# Changesets

Every user-facing change needs a changeset:

```bash
npx changeset
```

Pick the bump (patch / minor / major) and write one line for the changelog.

On merge to `main`, the Release workflow opens a "Version packages" PR. Merging that PR publishes
to npm and creates a GitHub Release.
