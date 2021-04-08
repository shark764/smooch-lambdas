const {
  jest: { config },
} = require('alonzo/utils');

config.setupFiles = ['<rootDir>/utils/jest/setEnvVars.js'];

config.coverageThreshold = {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
};

config.modulePathIgnorePatterns = ['<rootDir>/utils/scripts'];

module.exports = config;
