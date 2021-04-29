/**
 * Lambda that deletes a smooch whatsapp integration
 * */

const AWS = require('aws-sdk');
const Joi = require('joi');
const {
  lambda: {
    log,
    api: { validateTenantPermissions },
  },
} = require('alonzo');
const SunshineConversationsClient = require('sunshine-conversations-client');

const secretsClient = new AWS.SecretsManager();
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

const {
  REGION_PREFIX,
  ENVIRONMENT,
  SMOOCH_API_URL,
} = process.env;
const lambdaPermissions = ['WHATSAPP_INTEGRATIONS_APP_UPDATE'];

exports.handler = async (event) => {
  const { body, params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'] };
  /* **** Only used for automated tests **** Does not delete actual integration from Smooch **** */
  const automatedTest = body && (body.test) && (body.test === true) ? true : undefined;

  log.info('delete-whatsapp-integration was called', { ...logContext, params, SMOOCH_API_URL });

  /**
   * Validating permissions
   */

  const { 'tenant-id': tenantId, id: integrationId } = params;
  const validPermissions = validateTenantPermissions(tenantId, identity, lambdaPermissions);
  const expectedPermissions = {
    tenant: lambdaPermissions,
  };
  if (!validPermissions) {
    const errMsg = 'Error not enough permissions';

    log.warn(errMsg, { ...logContext, expectedPermissions });

    return {
      status: 403,
      body: { message: errMsg, expectedPermissions },
    };
  }

  /**
   * Validating parameters
   */

  try {
    await paramsSchema.validateAsync(params, { abortEarly: false });
  } catch (error) {
    const errMsg = 'Error: invalid params value(s).';
    const validationMessage = error.details
      .map(({ message }) => message)
      .join(' / ');

    log.warn(errMsg, { ...logContext, validationMessage }, error);

    return {
      status: 400,
      body: {
        message: `${errMsg} ${validationMessage}`,
        error,
      },
    };
  }

  /**
   * Getting apps keys from secret manager
   */

  let appSecrets;

  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${REGION_PREFIX}-${ENVIRONMENT}-smooch-app`,
    }).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to retrieve digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  /**
   * Getting apps records from dynamo
   */

  const queryParams = {
    Key: {
      'tenant-id': tenantId,
      id: integrationId,
    },
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
  };
  let appId;

  try {
    const queryResponse = await docClient.get(queryParams).promise();
    if (queryResponse.Item) {
      appId = queryResponse.Item['app-id'];
    } else {
      const errMsg = 'The integration does not exist for this tenant';

      log.error(errMsg, logContext);

      return {
        status: 404,
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

  /**
   * Delete integration records from smooch
   */

  /* Only used for automated testing */
  if (!automatedTest) {
    const defaultClient = SunshineConversationsClient.ApiClient.instance;
    let appKeys;
    try {
      appKeys = JSON.parse(appSecrets.SecretString);
    } catch (error) {
      const errMsg = 'An Error parsing smooch credential or credentials are empty';

      log.error(errMsg, logContext, error);

      return {
        status: 500,
        body: { message: errMsg },
      };
    }

    const { basicAuth } = defaultClient.authentications;
    basicAuth.username = appKeys[`${appId}-id`];
    basicAuth.password = appKeys[`${appId}-secret`];
    logContext.smoochAppId = appId;

    const apiInstance = new SunshineConversationsClient.IntegrationsApi();

    try {
      await apiInstance.deleteIntegration(appId, integrationId);
    } catch (error) {
      const errMsg = 'An Error has occurred trying to delete an whatsapp integration';

      log.error(errMsg, logContext, error);

      return {
        status: 500,
        body: { message: errMsg },
      };
    }
  }

  /**
   * Delete integration records from dynamo
   */

  const deleteParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
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

  log.info('user deleted a smooch whatsapp-integration', {
    userId: identity['user-id'],
    tenantId,
    smoochIntegrationId: integrationId,
    audit: true,
  });
  log.info('delete-whatsapp-integration complete', logContext);

  return {
    status: 200,
    body: { message: `The whatsapp integration for tenant ${tenantId} and integrationId ${integrationId} has been deleted successfully`, deleted: true },
  };
};
