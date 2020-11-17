const {
  jest: { config },
} = require('alonzo/utils');

config.coverageThreshold = {
  global: {
    branches: 90,
    functions: 90,
    lines: 90,
    statements: 90,
  },
};

module.exports = config;
