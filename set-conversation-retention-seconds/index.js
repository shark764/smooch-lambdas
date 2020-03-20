const log = require('serenova-js-utils/lambda/log');
const AWS = require('aws-sdk');
const SmoochCore = require('smooch-core');

AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();


const {
  AWS_REGION,
  ENVIRONMENT,
  smooch_api_url: smoochApiUrl,
} = process.env;

exports.handler = async () => {
  const accountSecrets = await secretsClient.getSecretValue({
    SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-account`,
  }).promise();
  const accountKeys = JSON.parse(accountSecrets.SecretString);
  const smooch = new SmoochCore({
    keyId: accountKeys.id,
    secret: accountKeys.secret,
    scope: 'account',
    serviceUrl: smoochApiUrl,
  });

  const appSecrets = await secretsClient.getSecretValue({
    SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
  }).promise();
  const appKeys = JSON.parse(appSecrets.SecretString);
  let appIds = Object.keys(appKeys)
    .filter((appSecretKey) => appSecretKey.includes('-id'))
    .map((appSecretKey) => appSecretKey
      .replace('-id', '')
      .replace('-old', ''));
  appIds = appIds.filter((appSecretKey, index) => (appIds.indexOf(appSecretKey) === index));

  let hasErrored = false;
  for (const appId of appIds) {
    const logContext = { appId };
    try {
      await smooch.apps.update(appId, {
        settings: { conversationRetentionSeconds: 3600 },
      });
    } catch (error) {
      log.error('An error occurred updating smooch app', logContext);
      hasErrored = true;
    }
  }

  if (hasErrored) {
    throw new Error('At least one of the apps was unable to update. See logs for details.');
  }
};
