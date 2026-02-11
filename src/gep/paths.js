const path = require('path');

function getRepoRoot() {
  // src/gep/paths.js -> repo root
  return path.resolve(__dirname, '..', '..');
}

function getWorkspaceRoot() {
  // skills/evolver -> workspace root
  return path.resolve(getRepoRoot(), '..', '..');
}

function getLogsDir() {
  return process.env.EVOLVER_LOGS_DIR || path.join(getWorkspaceRoot(), 'logs');
}

function getMemoryDir() {
  return process.env.MEMORY_DIR || path.join(getWorkspaceRoot(), 'memory');
}

function getEvolutionDir() {
  return process.env.EVOLUTION_DIR || path.join(getMemoryDir(), 'evolution');
}

function getGepAssetsDir() {
  const repoRoot = getRepoRoot();
  return process.env.GEP_ASSETS_DIR || path.join(repoRoot, 'assets', 'gep');
}

function getSkillsDir() {
  return process.env.SKILLS_DIR || path.join(getWorkspaceRoot(), 'skills');
}

module.exports = {
  getRepoRoot,
  getWorkspaceRoot,
  getLogsDir,
  getMemoryDir,
  getEvolutionDir,
  getGepAssetsDir,
  getSkillsDir,
};

