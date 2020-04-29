const AWS = require('aws-sdk');
const axios = require('axios');
const log = require('serenova-js-utils/lambda/log');

const secretsClient = new AWS.SecretsManager();

const {
  AWS_REGION, ENVIRONMENT, DOMAIN, ACCOUNT_ID,
} = process.env;

exports.handler = async () => {
  const logContext = {};

  log.info('register-gateway was called', { ...logContext });

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient
      .getSecretValue({
        SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-cx`,
      })
      .promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);
  const url = `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/gateways`;
  const data = {
    url: '',
    type: 'smooch',
    actions: [
      {
        name: 'add-participant',
        target: `arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${AWS_REGION}-${ENVIRONMENT}-smooch-action-add-participant`,
      },
      {
        name: 'disconnect',
        target: `arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${AWS_REGION}-${ENVIRONMENT}-smooch-action-disconnect`,
      },
      {
        name: 'send-message',
        target: `arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${AWS_REGION}-${ENVIRONMENT}-smooch-action-send-message`,
      },
      {
        name: 'collect-message-response',
        target: `arn:aws:sqs:${AWS_REGION}:${ACCOUNT_ID}:${AWS_REGION}-${ENVIRONMENT}-smooch-action-collect-message-response`,
      },
    ],
    subscriptions: [],
  };

  try {
    await axios({
      method: 'post',
      url,
      data,
      auth: cxAuth,
    });
  } catch (error) {
    log.error('An Error has occurred trying to register gateway', logContext, error);
    throw error;
  }

  log.info('register-gateway complete', {
    ...logContext,
    data,
  });

  return {
    status: 200,
    body: {
      message: 'Gateway registered successfully',
    },
  };
};
