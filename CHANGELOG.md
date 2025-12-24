# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2025-12-24

### Added
- Ability to copy from any existing configuration when creating a new one
- "Copy from another configuration" option in create config menu
- Shows source configuration name when creating from a copy

### Changed
- Reordered create configuration options for better UX
- Option [2] is now "Copy from another configuration" with interactive selection
- Option [3] is now "Copy current configuration" 
- Option [4] is now "Minimal configuration (no agents)"

### Fixed
- Previously could only copy from omo-default or current config, now can copy from any config

## [0.1.0] - 2025-12-24

### Added
- **Named configuration profiles** - Create, save, and switch between multiple agent configurations
- Configuration management menu with full CRUD operations (create, rename, delete, switch)
- Built-in "omo-default" configuration with Oh My Opencode defaults
- Automatic migration of existing configuration to "user-config" on first run
- Configuration metadata tracking (name, description, created/modified timestamps)
- Configuration export/import functionality for sharing and backup
- Config-specific backup naming for better organization
- Active configuration display in main menu with metadata
- Configuration-filtered backup viewer with option to view all backups
- ConfigurationManager class for centralized config operations
- Smart configuration creation with recommended defaults (copy omo-default)
- Context-aware tips after creating/switching configurations
- Warning when creating minimal configs without agents

### Changed
- Main menu now displays active configuration info at top
- "Restore defaults" now switches to "omo-default" configuration instead of overwriting
- Backup files now named with config name prefix (e.g., `user-config-2025-12-24T12-00-00.json`)
- Configuration structure now includes metadata wrapper with name, description, timestamps

### Technical
- New directory structure: `~/.config/opencode/configs/` for storing named configurations
- Active config tracked in `~/.config/opencode/active-config.json`
- All configuration operations go through ConfigurationManager for consistency
- Configuration names validated (alphanumeric, hyphens, underscores only)

## [0.0.2] - 2025-12-24

### Added
- Provider filtering feature - filter models by provider(s)
- Preferred providers configuration - set provider preference order
- Model recommendations now boost preferred providers in scoring
- Multi-select provider filter menu
- WARP.md documentation for repository guidance
- Dynamic provider extraction from available models

### Fixed
- Fixed JSON parser to handle nested braces using brace counting
- Updated regex to match model IDs with multiple slashes (e.g. openrouter/openai/model)
- Use providerID field from model data instead of splitting ID string
- Suppress stderr to prevent plugin messages from corrupting JSON parsing
- Now correctly loads 200+ models from all 6 providers (anthropic, cerebras, google, opencode, openrouter, xai)

## [0.0.1] - 2025-12-23

### Added
- Initial release
- Interactive CLI for managing Oh My Opencode agent model assignments
- Smart model recommendations based on agent profiles
- Automatic configuration backups
- Model search functionality
- Agent management (add, edit, delete)
- Restore defaults functionality
- Support for 200+ models from multiple providers
