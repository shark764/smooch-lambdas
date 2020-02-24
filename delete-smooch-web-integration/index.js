/**
 * Lambda that deletes a smooch web integration
 * */

const AWS = require('aws-sdk');

const secretsClient = new AWS.SecretsManager();
const Joi = require('@hapi/joi');
const log = require('serenova-js-utils/lambda/log');
const SmoochCore = require('smooch-core');
const { validateTenantPermissions } = require('serenova-js-utils/lambda/api');

AWS.config.update({ region: process.env.AWS_REGION });
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
const lambdaPermissions = ['WEB_INTEGRATIONS_APP_UPDATE'];

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT, smooch_api_url: smoochApiUrl } = process.env;
  const { params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'] };

  log.info('delete-smooch-web-integration was called', { ...logContext, params, smoochApiUrl });

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
      SecretId: `${AWS_REGION}-${ENVIRONMENT}-smooch-app`,
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
  const validPermissions = validateTenantPermissions(tenantId, identity, lambdaPermissions);

  if (!validPermissions) {
    const errMsg = 'Error not enough permissions';

    log.warn(errMsg, logContext);

    return {
      status: 400,
      body: { message: errMsg },
    };
  }

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
      const errMsg = 'The app does not exist for this tenant';

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

  let smooch;

  try {
    const appKeys = JSON.parse(appSecrets.SecretString);
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
      serviceUrl: smoochApiUrl,
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to validate digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  logContext.smoochAppId = appId;

  try {
    await smooch.integrations.delete({ appId, integrationId });
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

  log.debug('Deleting record in DynamoDB', { ...logContext, deleteParams });
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

  log.info('user deleted a smooch web-integration', {
    userId: identity['user-id'],
    tenantId,
    smoochIntegrationId: integrationId,
    audit: true,
  });
  log.info('delete-smooch-web-integration complete', logContext);

  return {
    status: 200,
    body: { message: `The web integration with for tenant ${tenantId} and integrationId ${integrationId} has been deleted successfully`, deleted: true },
  };
};
