module.exports = {
  verbose: false,
  reporters: [
    '<rootDir>/utils/no-logs-reporter.js',
    '<rootDir>/utils/summary-reporter.js',
  ],
  collectCoverageFrom: ['**/*.js'],
  coveragePathIgnorePatterns: [
    'coverage',
    'node_modules',
    'utils',
    'jest.config.js',
  ],
};
