/* eslint-disable import/no-extraneous-dependencies */
// eslint-disable-next-line import/no-extraneous-dependencies
const {
  jest: {
    reporters: { noLogs },
  },
} = require('alonzo/utils');

module.exports = noLogs;
