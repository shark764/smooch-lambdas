const {
  jest: { config },
} = require('alonzo/utils');

config.coverageThreshold = {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
};

module.exports = config;
