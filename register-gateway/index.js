const AWS = require('aws-sdk');
const axios = require('axios');
const { lambda: { log } } = require('alonzo');

const secretsClient = new AWS.SecretsManager();

const {
  REGION_PREFIX,
  REGION,
  ENVIRONMENT,
  DOMAIN,
  ACCOUNT_ID,
} = process.env;

exports.handler = async () => {
  const logContext = {};

  log.info('register-gateway was called', { ...logContext });

  let cxAuthSecret;
  try {
    cxAuthSecret = await secretsClient
      .getSecretValue({
        SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-cx`,
      })
      .promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve cx credentials';

    log.error(errMsg, logContext, error);

    throw error;
  }

  const cxAuth = JSON.parse(cxAuthSecret.SecretString);
  const url = `https://${REGION_PREFIX}-${ENVIRONMENT}-edge.${DOMAIN}/v1/gateways`;
  const data = {
    url: '',
    type: 'smooch',
    actions: [
      {
        name: 'add-participant',
        target: `arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${REGION_PREFIX}-${ENVIRONMENT}-smooch-action-add-participant`,
      },
      {
        name: 'disconnect',
        target: `arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${REGION_PREFIX}-${ENVIRONMENT}-smooch-action-disconnect`,
      },
      {
        name: 'send-message',
        target: `arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${REGION_PREFIX}-${ENVIRONMENT}-smooch-action-send-message`,
      },
      {
        name: 'collect-message-response',
        target: `arn:aws:sqs:${REGION}:${ACCOUNT_ID}:${REGION_PREFIX}-${ENVIRONMENT}-smooch-action-collect-message-response`,
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
