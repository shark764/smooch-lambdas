/**
 * Lambda that gets a web integration from Smooch
 * */

const AWS = require('aws-sdk');
const {
  lambda: {
    log,
    api: { validateTenantPermissions, validatePlatformPermissions },
  },
} = require('alonzo');
const SmoochCore = require('smooch-core');
const string = require('serenova-js-utils/strings');
const Joi = require('joi');

const secretsClient = new AWS.SecretsManager();
const docClient = new AWS.DynamoDB.DocumentClient();

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid().required(),
  id: Joi.string().required(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

const { REGION_PREFIX, ENVIRONMENT, SMOOCH_API_URL } = process.env;
const lambdaPermissions = ['WEB_INTEGRATIONS_APP_READ'];
const lambdaPlatformPermissions = ['PLATFORM_VIEW_ALL'];

exports.handler = async (event) => {
  const { params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], userId: identity['user-id'], smoochIntegrationId: params.id };

  log.info('get-smooch-web-integration was called', { ...logContext, params, SMOOCH_API_URL });

  /**
   * Validating permissions
   */
  const { 'tenant-id': tenantId, id: integrationId } = params;
  const validPermissions = validateTenantPermissions(tenantId, identity, lambdaPermissions);
  const validPlatformPermissions = validatePlatformPermissions(identity, lambdaPlatformPermissions);
  const expectedPermissions = {
    tenant: lambdaPermissions,
    platform: lambdaPlatformPermissions,
  };
  if (!(validPermissions || validPlatformPermissions)) {
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

  let dynamoValue;
  let appId;

  try {
    const { Item } = await docClient.get(queryParams).promise();
    if (Item) {
      dynamoValue = Item;
      appId = dynamoValue['app-id'];
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

  let smooch;
  try {
    const appKeys = JSON.parse(appSecrets.SecretString);
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
      serviceUrl: SMOOCH_API_URL,
    });
  } catch (error) {
    const errMsg = 'An Error has occurred trying to validate digital channels credentials';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  let smoochIntegration;

  try {
    const { integration } = await smooch.integrations.get(appId, integrationId);

    smoochIntegration = integration;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch a web integration';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  const dynamoValueCased = {};

  if (smoochIntegration.brandColor) {
    smoochIntegration.brandColor = `#${smoochIntegration.brandColor}`;
  }
  if (smoochIntegration.conversationColor) {
    smoochIntegration.conversationColor = `#${smoochIntegration.conversationColor}`;
  }
  if (smoochIntegration.actionColor) {
    smoochIntegration.actionColor = `#${smoochIntegration.actionColor}`;
  }

  delete smoochIntegration.integrationOrder;
  delete smoochIntegration._id;
  delete smoochIntegration.displayName;
  delete smoochIntegration.status;
  delete smoochIntegration.type;
  smoochIntegration.whitelistedUrls = smoochIntegration.originWhitelist;
  delete smoochIntegration.originWhitelist;
  delete dynamoValue.type;
  smoochIntegration.prechatCapture = smoochIntegration.prechatCapture.enabled ? smoochIntegration.prechatCapture.fields[0].name : 'none';
  Object.keys(dynamoValue).forEach((v) => {
    dynamoValueCased[string.kebabCaseToCamelCase(v)] = dynamoValue[v];
  });

  const result = {
    ...smoochIntegration,
    ...dynamoValueCased,
  };

  log.info('get-smooch-web-integration complete', { ...logContext, result });

  return {
    status: 200,
    body: { result },
  };
};
