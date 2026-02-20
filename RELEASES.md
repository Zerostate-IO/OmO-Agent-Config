# Release Process

## Release Discipline (Required)

For this repository, every merged bug fix or feature change must ship with a versioned release.

- Bug fix -> bump PATCH, update `CHANGELOG.md`, create/push tag, publish GitHub release.
- Feature add -> bump MINOR, update `CHANGELOG.md`, create/push tag, publish GitHub release.
- If a PR is merged without release artifacts, follow up immediately with a release-only PR.

## Version Numbering

This project follows semantic versioning: `MAJOR.MINOR.PATCH`

### Version Increment Rules

- **Bugfix** (x.x.1): Increment PATCH version
  - Bug fixes
  - Performance improvements
  - Documentation fixes
  - No new features

- **Feature** (x.1.x): Increment MINOR version
  - New features
  - New functionality
  - Non-breaking changes
  - Reset PATCH to 0

- **Major Release** (1.x.x): Increment MAJOR version
  - Only when explicitly called for
  - Breaking changes
  - Major architectural changes
  - Reset MINOR and PATCH to 0

## Current Version

See `VERSION` file for the current version.

## Creating a Release

### Mandatory Checklist

- [ ] Update `VERSION` using semantic version rules.
- [ ] Add release notes to `CHANGELOG.md`.
- [ ] Commit release files (`VERSION`, `CHANGELOG.md`, and any related docs).
- [ ] Create annotated tag (`vX.Y.Z`).
- [ ] Push branch and tag to GitHub.
- [ ] Create GitHub Release for that tag.

### 1. Update VERSION file

```bash
# For bugfix (0.0.1 -> 0.0.2)
echo "0.0.2" > VERSION

# For feature (0.0.2 -> 0.1.0)
echo "0.1.0" > VERSION

# For major (0.1.0 -> 1.0.0)
echo "1.0.0" > VERSION
```

### 2. Update CHANGELOG.md

Add release notes under the new version:

```markdown
## [0.0.2] - 2025-12-24

### Fixed
- Fixed provider filtering to properly parse all models
- JSON parser now handles nested braces correctly

### Added
- Provider filtering feature
- Preferred providers configuration
```

### 3. Commit version bump

```bash
git add VERSION CHANGELOG.md
git commit -m "Bump version to 0.0.2"
```

### 4. Create and push tag

```bash
git tag -a v0.0.2 -m "Release v0.0.2"
git push origin main
git push origin v0.0.2
```

### 5. Create GitHub Release

Go to GitHub > Releases > Create new release
- Tag: v0.0.2
- Title: Release v0.0.2
- Copy release notes from CHANGELOG.md

## Release History

- **v0.8.0** (2026-02-20) - Backup lifecycle management, discouraged-model warnings, upstream sync tooling, and expanded test coverage
- **v0.7.0** (2026-02-12) - Pending-change UX and model change review improvements
- **v0.6.0** (2026-02-12) - Web UI + refreshed model discovery
- **v0.5.0** (2025-12-30) - Project scope, secrets portability, provider preferences
- **v0.4.0** (2025-12-29) - QoL bulk workflows + modular architecture

## Recent Releases

- **v0.8.0** (2026-02-20) - Backup lifecycle management + upstream sync workflow
- **v0.7.0** (2026-02-12) - Pending model change UX + review modal
- **v0.6.0** (2026-02-12) - Web UI + refreshed model discovery
