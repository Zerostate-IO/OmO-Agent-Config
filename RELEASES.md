# Release Process

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

- **v0.0.2** (2025-12-24) - Provider filtering fixes
- **v0.0.1** (Initial) - First working version with basic functionality
