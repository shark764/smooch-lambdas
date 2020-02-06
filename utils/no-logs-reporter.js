/* eslint-disable import/no-extraneous-dependencies */
// eslint-disable-next-line import/no-extraneous-dependencies
const chalk = require('chalk');
const { getConsoleOutput } = require('jest-util');
const VerboseReporter = require('@jest/reporters/build/verbose_reporter')
  .default;
const getResultHeader = require('@jest/reporters/build/get_result_header')
  .default;

const TITLE_BULLET = chalk.bold('\u25cf ');

class NoLogsOnSucessReporter extends VerboseReporter {
  constructor(globalConfig, options) {
    super(globalConfig);
    this._options = options;
  }

  printTestFileHeader(testPath, config, result) {
    this.log(getResultHeader(result, this._globalConfig, config));

    const consoleBuffer = result.console;
    const testFailed = result.numFailingTests > 0;

    if (testFailed && consoleBuffer && consoleBuffer.length) {
      this.log(
        `  ${TITLE_BULLET}Console\n\n${getConsoleOutput(
          config.cwd,
          !!this._globalConfig.verbose,
          consoleBuffer,
        )}`,
      );
    }
  }
}

module.exports = NoLogsOnSucessReporter;
