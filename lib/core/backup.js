/**
 * Backup module for configuration management
 * Handles creating and restoring backups
 */

const fs = require('fs');
const path = require('path');
const { BACKUP_DIR, CONFIG_FILE } = require('../constants');

/**
 * Create a timestamped backup of current configuration
 */
async function createBackup() {
  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Generate timestamp
  const timestamp = new Date().toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  
  const backupPath = path.join(BACKUP_DIR, `oh-my-opencode-${timestamp}.json`);
  
  // Read current config
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error('No active configuration to backup');
  }
  
  const config = fs.readFileSync(CONFIG_FILE, 'utf8');
  
  // Write backup
  fs.writeFileSync(backupPath, config);
  
  return {
    timestamp,
    path: backupPath,
    size: Buffer.byteLength(config, 'utf8')
  };
}

/**
 * List all available backups
 */
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('oh-my-opencode-') && f.endsWith('.json'))
    .sort()
    .reverse();

  return files.map(file => {
    const timestamp = file.replace('oh-my-opencode-', '').replace('.json', '');
    const filePath = path.join(BACKUP_DIR, file);
    const stats = fs.statSync(filePath);
    
    return {
      timestamp,
      path: filePath,
      size: stats.size,
      createdAt: stats.mtime.toISOString()
    };
  });
}

/**
 * Restore from a backup
 */
async function restoreBackup(timestamp) {
  const backupPath = path.join(BACKUP_DIR, `oh-my-opencode-${timestamp}.json`);
  
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${timestamp}`);
  }
  
  // Backup current before restoring
  await createBackup();
  
  // Restore
  const backup = fs.readFileSync(backupPath, 'utf8');
  fs.writeFileSync(CONFIG_FILE, backup);
  
  return {
    timestamp,
    restored: true
  };
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup
};
