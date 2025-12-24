# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
