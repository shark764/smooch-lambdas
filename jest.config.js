const {
  jest: { config },
} = require('alonzo/utils');

config.coverageThreshold = {
  global: {
    branches: 95,
    functions: 95,
    lines: 95,
    statements: 95,
  },
};

module.exports = config;
