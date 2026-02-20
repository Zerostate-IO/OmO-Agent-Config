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

/**
 * Delete a backup (soft-delete moves to .trash/)
 * @param {string} timestamp - Backup timestamp to delete
 * @param {Object} options - Options
 * @param {boolean} options.softDelete - If true, move to .trash/ instead of permanent delete (default: true)
 * @returns {Object} Result of deletion
 */
function deleteBackup(timestamp, options = {}) {
  const { softDelete = true } = options;
  const backupPath = path.join(BACKUP_DIR, `oh-my-opencode-${timestamp}.json`);

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup not found: ${timestamp}`);
  }

  if (softDelete) {
    // Create .trash directory if it doesn't exist
    const trashDir = path.join(BACKUP_DIR, '.trash');
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }

    // Move to trash
    const trashPath = path.join(trashDir, `oh-my-opencode-${timestamp}.json`);
    fs.renameSync(backupPath, trashPath);

    return {
      timestamp,
      softDeleted: true,
      movedTo: trashPath
    };
  } else {
    // Permanent delete
    fs.unlinkSync(backupPath);

    return {
      timestamp,
      softDeleted: false,
      deleted: true
    };
  }
}

/**
 * Purge old backups based on retention policy
 * @param {Object} options - Retention options
 * @param {number} options.keepNewest - Number of newest backups to keep (default: 10)
 * @param {number} options.keepDays - Keep backups within this many days (default: 7)
 * @param {boolean} options.dryRun - If true, only return preview without deleting (default: false)
 * @returns {Object} Purge results with kept, wouldPurge, and purged lists
 */
function purgeBackups(options = {}) {
  const { keepNewest = 10, keepDays = 7, dryRun = false } = options;

  // Get all backups
  const allBackups = listBackups();

  if (allBackups.length === 0) {
    return {
      dryRun,
      kept: [],
      wouldPurge: [],
      purged: []
    };
  }

  // Sort by createdAt (newest first)
  const sortedBackups = allBackups.sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Calculate cutoff date for keepDays
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);

  const kept = [];
  const wouldPurge = [];
  const purged = [];

  sortedBackups.forEach((backup, index) => {
    const backupDate = new Date(backup.createdAt);
    const isWithinKeepDays = backupDate >= cutoffDate;
    const isWithinKeepNewest = index < keepNewest;

    // Keep if within keepDays OR within keepNewest newest
    if (isWithinKeepDays || isWithinKeepNewest) {
      kept.push(backup);
    } else {
      wouldPurge.push(backup);
    }
  });

  // If not dryRun, actually delete the backups (soft-delete)
  if (!dryRun) {
    for (const backup of wouldPurge) {
      try {
        const result = deleteBackup(backup.timestamp, { softDelete: true });
        purged.push({
          ...backup,
          movedTo: result.movedTo
        });
      } catch (err) {
        // If deletion fails, add to wouldPurge but not purged
        console.error(`Failed to purge backup ${backup.timestamp}: ${err.message}`);
      }
    }
  }

  return {
    dryRun,
    kept,
    wouldPurge,
    purged
  };
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  purgeBackups
};
