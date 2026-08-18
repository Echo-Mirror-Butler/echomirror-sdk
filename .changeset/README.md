# Changesets

Hello and welcome! This directory contains configuration and pending changesets for automated package releases via [Changesets](https://github.com/changesets/changesets).

## Adding a changeset

When creating a PR that modifies any package under `packages/js/*`, please add a changeset by running:

```bash
npm run changeset
```

Follow the interactive prompts to select the packages that were changed, choose the appropriate semver bump (`patch`, `minor`, or `major`), and provide a clear summary of the changes.

Commit the generated markdown file in `.changeset/` along with your code changes.
