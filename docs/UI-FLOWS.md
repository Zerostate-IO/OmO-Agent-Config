# UI Flows and Navigation

This document outlines all user flows and navigation paths in the OmO Agent Config tool.

## Entry Points

### Interactive Mode (Default)
```bash
opencode-agent-config
```
→ Main Menu

### CLI Mode
```bash
opencode-agent-config -s <config>    # Quick switch
opencode-agent-config -l              # List configs
opencode-agent-config -c              # Show current
opencode-agent-config -h              # Help
```
→ Execute and exit

---

## Main Menu

**Display:**
- Active configuration info (name, description, modified date)
- List of all agents with their assigned models (numbered 1-N)
- Capability legend: `[R]=Reasoning [I]=Image [P]=PDF`

**Options:**
- `[E]` Edit agent model (enter number or name)
- `[A]` Add new agent
- `[D]` Delete agent (enter number or name)
- `[P]` Set preferred providers
- `[M]` Manage configurations
- `[R]` Restore defaults
- `[B]` View backups
- `[Q]` Quit

---

## Flow 1: Edit Agent Model

**Path:** Main Menu → [E] → Select agent → Choose model

**Steps:**
1. User enters `E`
2. Prompt: "Agent # or name:"
   - User can enter number (e.g., "1") or name (e.g., "oracle")
3. → Model Selection Menu

### Model Selection Menu

**Display:**
- Agent name and description
- Current model
- Top 8 recommended models (sorted by suitability score)
  - Format: `Name (ContextSize[Caps]) provider`
  - Current model marked with ⭐

**Options:**
- `1-8`: Select recommended model
- `[S]` Search all models
- `[F]` Filter by provider
- `[C]` Cancel

#### Flow 1a: Search All Models

**Path:** Model Selection → [S] → Enter query → Model List

**Steps:**
1. Prompt: "Search (provider/name or Enter for all):"
2. Filter models by query (searches ID and name)
3. → Paginated Model List (15 per page)

#### Flow 1b: Filter by Provider

**Path:** Model Selection → [F] → Select providers → Model List

**Steps:**
1. Display all providers with model counts
2. Prompt: "Select providers (comma-separated numbers):"
   - Options: Numbers, `[A]` all, `[C]` cancel
3. → Paginated Model List (filtered)

#### Flow 1c: Paginated Model List

**Display:**
- 15 models per page
- Model format: `Name (ContextSize[Caps]) provider`
- Current model marked with ⭐

**Options:**
- `1-N`: Select model number
- `[N]` Next page
- `[P]` Previous page
- `[C]` Cancel → Model Selection

**Result:**
- Config saved with backup
- → Main Menu

---

## Flow 2: Add New Agent

**Path:** Main Menu → [A] → Enter details → Choose model

**Steps:**
1. User enters `A`
2. Prompt: "Agent name:" (must be unique)
3. → Model Selection Menu (same as Flow 1)
4. Config saved with backup
5. → Main Menu

---

## Flow 3: Delete Agent

**Path:** Main Menu → [D] → Select agent → Confirm

**Steps:**
1. User enters `D`
2. Prompt: "Agent # or name:"
   - User can enter number or name
3. Prompt: "Delete agent \"name\"? (yes/no):"
4. If yes: Config saved with backup
5. → Main Menu

---

## Flow 4: Set Preferred Providers

**Path:** Main Menu → [P] → Select providers

**Display:**
- Current preferred providers (if any)
- All available providers with model counts

**Options:**
- Enter comma-separated numbers
- `[C]` Clear preferences
- `[X]` Cancel

**Result:**
- Config saved with backup
- → Main Menu

---

## Flow 5: Manage Configurations

**Path:** Main Menu → [M] → Configuration Management Menu

### Configuration Management Menu

**Display:**
- List all configurations with:
  - Name (and `[ACTIVE]` marker)
  - Description
  - Modified date

**Options:**
- `[S]` Switch active configuration
- `[C]` Create new configuration
- `[R]` Rename configuration
- `[D]` Delete configuration
- `[E]` Export configuration
- `[I]` Import configuration
- `[X]` Return to main menu

#### Flow 5a: Switch Configuration

**Path:** Config Management → [S] → Select config

**Steps:**
1. Display numbered list of configs with `[ACTIVE]` marker
2. Prompt: "Select configuration:" or `[C]` cancel
3. Switch to selected config
4. → Config Management Menu

#### Flow 5b: Create New Configuration

**Path:** Config Management → [C] → Configure → Optional agent setup

**Steps:**
1. Prompt: "Configuration name:"
2. Prompt: "Description:"
3. Display creation options:
   - `[1]` Copy omo-default (recommended)
   - `[2]` Copy from another configuration
   - `[3]` Copy current configuration
   - `[4]` Minimal configuration (no agents)
4. If option 2: → Select source config from list
5. Config created
6. Prompt: "Switch to this configuration now? (yes/no):"
7. If yes and has agents:
   - Prompt: "Would you like to configure agents now? (yes/no):"
   - If yes: → Agent Configuration Menu
8. If yes and no agents:
   - "Let's add agents to this configuration."
   - → Agent Configuration Menu
9. → Config Management Menu

##### Agent Configuration Menu

**Display:**
- List of agents (numbered)
- Capability legend

**Options:**
- `[E]` Edit agent model (number or name)
- `[A]` Add new agent
- `[D]` Delete agent (number or name)
- `[X]` Return to main menu

(Same agent operations as Main Menu flows 1-3)

#### Flow 5c: Rename Configuration

**Path:** Config Management → [R] → Select → Enter new name

**Steps:**
1. Display numbered list of configs
2. Prompt: "Select configuration to rename:" or `[C]` cancel
3. Prompt: "New name:"
4. Rename with validation (alphanumeric, hyphens, underscores)
5. → Config Management Menu

#### Flow 5d: Delete Configuration

**Path:** Config Management → [D] → Select → Confirm

**Steps:**
1. Display numbered list (active config marked as cannot delete)
2. Prompt: "Select configuration to delete:" or `[C]` cancel
3. Validation: Cannot delete active or last config
4. Prompt: "Delete \"name\"? This cannot be undone. (yes/no):"
5. If yes: Delete config
6. → Config Management Menu

#### Flow 5e: Export Configuration

**Path:** Config Management → [E] → Select → Specify path

**Steps:**
1. Display numbered list of configs
2. Prompt: "Select configuration to export:" or `[C]` cancel
3. Prompt: "Destination path (e.g., ~/my-config.json):"
4. Export config with metadata to file
5. → Config Management Menu

#### Flow 5f: Import Configuration

**Path:** Config Management → [I] → Specify source → Name it

**Steps:**
1. Prompt: "Source path (e.g., ~/my-config.json):"
2. Prompt: "Configuration name:"
3. Prompt: "Description (optional):"
4. Import config (handles both wrapped and unwrapped formats)
5. → Config Management Menu

---

## Flow 6: Restore Defaults

**Path:** Main Menu → [R] → Confirm

**Steps:**
1. User enters `R`
2. Prompt: "Restore all agents to defaults? (yes/no):"
3. If yes: Switch to "omo-default" configuration
4. → Main Menu

---

## Flow 7: View Backups

**Path:** Main Menu → [B] → Optional: view all

**Display:**
- Backups for current config (up to 10)
- Count of other configs' backups

**Steps:**
1. Show backups for active config
2. If other backups exist:
   - Prompt: "Show all backups? (yes/no):"
   - If yes: Show all backups (up to 20)
3. Prompt: "Press Enter to continue..."
4. → Main Menu

---

## Error Handling

### Invalid Agent Selection
- Message: "Agent not found"
- → Prompt to continue → Return to menu

### Invalid Configuration Name
- On create/rename: Validates alphanumeric, hyphens, underscores
- Message: "Invalid configuration name..."

### Configuration Already Exists
- On create: "Configuration already exists"
- On rename: "Configuration \"name\" already exists"

### Cannot Delete Constraints
- Active configuration: "Cannot delete active configuration. Switch to another first."
- Last configuration: "Cannot delete the last configuration"

### Model Loading Errors
- If `opencode models` fails: Fatal error, exit

---

## Visual Elements

### Color Coding
- **Cyan**: Provider names in model lists
- **Gray/Muted**: Capability legend text

### Indicators
- ⭐ - Current/active selection
- `[ACTIVE]` - Active configuration in lists
- `[CURRENT]` - Current configuration when copying
- Numbers - Agent/config selection indices

### Formatting
- Model display: `Name (ContextSize[Caps]) provider`
- Example: `Claude Opus 4.5 (200K[RIP]) anthropic`

---

## Navigation Summary

```
Main Menu
├── [E] Edit Agent → Model Selection → (Search/Filter) → Model List
├── [A] Add Agent → Model Selection → (Search/Filter) → Model List
├── [D] Delete Agent → Confirm
├── [P] Preferred Providers → Select
├── [M] Manage Configurations
│   ├── [S] Switch → Select
│   ├── [C] Create → Configure → (Agent Config Menu)
│   ├── [R] Rename → Select → Enter name
│   ├── [D] Delete → Select → Confirm
│   ├── [E] Export → Select → Enter path
│   └── [I] Import → Enter path → Name it
├── [R] Restore Defaults → Confirm
├── [B] View Backups → (Optional: view all)
└── [Q] Quit

CLI Mode (direct execution)
├── -s <config> → Switch and exit
├── -l → List and exit
├── -c → Show current and exit
└── -h → Help and exit
```
