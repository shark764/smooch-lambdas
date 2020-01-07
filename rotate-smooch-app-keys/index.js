/**
 * Lambda that rotates smooch app keys (for security https://media.tenor.com/images/b932f15ba124ceab6614c0ba716ec8d2/tenor.gif)
 * */

const SmoochCore = require('smooch-core');
const AWS = require('aws-sdk');
const log = require('serenova-js-utils/lambda/log');

AWS.config.update({ region: process.env.AWS_REGION });
const secretsClient = new AWS.SecretsManager();

exports.handler = async () => {
  const { AWS_REGION, ENVIRONMENT, smooch_api_url: smoochApiUrl } = process.env;

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
  const appIds = Object.keys(appKeys)
    .filter((appSecretKey) => appSecretKey.includes('-id'))
    .map((appSecretKey) => appSecretKey.replace('id', ''));

  let hasErrored = false;
  for (const appId of appIds) {
    const logContext = { appId };
    try {
      const { key: newSmoochAppKeys } = await smooch.apps.keys.create(appId, appId);
      if (appKeys[`${appId}-id-old`]) {
        await smooch.apps.keys.delete(appId, appKeys[`${appId}-id-old`]);
      } else {
        log.debug('App does not have old appKeys.', logContext);
      }
      appKeys[`${appId}-id-old`] = appKeys[`${appId}-id`];
      appKeys[`${appId}-secret-old`] = appKeys[`${appId}-secret`];
      appKeys[`${appId}-id`] = newSmoochAppKeys._id;
      appKeys[`${appId}-secret`] = newSmoochAppKeys.secret;
    } catch (error) {
      hasErrored = true;
      log.error('An error occurred trying to rotate app keys', logContext, error);
    }
  }

  await secretsClient.putSecretValue({
    SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
    SecretString: JSON.stringify(appKeys),
  }).promise();

  if (hasErrored) {
    throw new Error('At least one of the apps was unable to rotate app keys. See logs for details.');
  }
};
