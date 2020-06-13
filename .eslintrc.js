const {
  utils: {
    eslint: { rules },
  },
} = require('alonzo');

rules.rules = {
  /**
   * Adding this rule just for Smooch SDK use
   */
  'no-underscore-dangle': 0,
  'no-restricted-syntax': 0,
  'no-await-in-loop': 0,
  'no-use-before-define': [2, 'nofunc'],
};

module.exports = rules;
