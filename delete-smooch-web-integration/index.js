/**
 * Lambda that deletes an smooch web integration
 * */

const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();
const Joi = require('@hapi/joi');
const axios = require('axios');
const log = require('serenova-js-utils/lambda/log');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const paramsSchema = Joi.object({
  'tenant-id': Joi.string()
    .required()
    .guid(),
  id: Joi.string()
    .required(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT } = process.env;
  const { params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'] };

  log.info('delete-smooch-web-integration was called', logContext);

  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    log.error('Error: invalid params value', logContext, error);

    return {
      status: 400,
      body: { message: `Error: invalid params value ${error.details[0].message}` },
    };
  }

  let appSecrets;

  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const { 'tenant-id': tenantId, id: integrationId } = params;
  const appKeys = JSON.parse(appSecrets.SecretString);
  const queryParams = {
    Key: {
      'tenant-id': tenantId,
      id: integrationId,
    },
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
  };
  let appId;

  try {
    const queryResponse = await docClient.get(queryParams).promise();
    if (queryResponse.Item) {
      appId = queryResponse.Item['app-id'];
    } else {
      const errMsg = 'An Error has occurred trying to fetch an app';

      log.error(errMsg, logContext);

      return {
        status: 400,
        body: { message: errMsg },
      };
    }
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch an app in DynamoDB';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const smoochApiUrl = `https://api.smooch.io/v1.1/apps/${appId}/integrations/${integrationId}`;

  logContext.smoochAppId = appId;
  try {
    await axios.delete(smoochApiUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${appKeys[`${appId}-id`]}:${appKeys[`${appId}-secret`]}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete an web integration';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const deleteParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    Key: {
      'tenant-id': tenantId,
      id: integrationId,
    },
  };

  try {
    await docClient.delete(deleteParams).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to delete a record in DynamoDB';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  log.info('delete-smooch-web-integration complete', logContext);

  return {
    status: 200,
    body: { message: `The web integration with for tenant ${tenantId} and integrationId ${integrationId} has been deleted successfully`, deleted: true },
  };
};
