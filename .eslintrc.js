module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es6: true,
    jest: true
  },
  extends: [
    'airbnb-base',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  rules: {
    'no-underscore-dangle': 0, // Smooch SDK uses these
    'no-restricted-syntax': 0, // Sorta contested what the correct approach should be. `for of` is wayyy more readable. https://github.com/airbnb/javascript/issues/1271#issuecomment-498835882
    'no-await-in-loop': 0,
    'no-use-before-define': [2, 'nofunc'], // Allow functions and classes to be defined after use. Compiler can handle this and it makes the code more readable.
  },
};
