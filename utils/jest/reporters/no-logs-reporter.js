/* eslint-disable import/no-extraneous-dependencies */
// eslint-disable-next-line import/no-extraneous-dependencies
const {
  utils: {
    jest: {
      reporters: { noLogs },
    },
  },
} = require('alonzo');

module.exports = noLogs;
