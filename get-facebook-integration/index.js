const AWS = require('aws-sdk');
const Joi = require('joi');
const axios = require('axios');
const string = require('serenova-js-utils/strings');
const {
  lambda: {
    log,
    api: { validateTenantPermissions, validatePlatformPermissions },
  },
} = require('alonzo');

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
const lambdaPermissions = ['FACEBOOK_INTEGRATIONS_APP_READ'];
const lambdaPlatformPermissions = ['PLATFORM_VIEW_ALL'];

exports.handler = async (event) => {
  const { params, identity } = event;

  const { 'tenant-id': tenantId, id: integrationId } = params;
  const logContext = {
    tenantId,
    smoochUserId: identity['user-id'],
    integrationId,
  };

  log.info('get-facebook-integration was called', {
    ...logContext,
    params,
    SMOOCH_API_URL,
  });

  /**
   * Validating permissions
   */
  const validPermissions = validateTenantPermissions(
    tenantId,
    identity,
    lambdaPermissions,
  );
  const validPlatformPermissions = validatePlatformPermissions(
    identity,
    lambdaPlatformPermissions,
  );

  if (!(validPermissions || validPlatformPermissions)) {
    const expectedPermissions = {
      tenant: lambdaPermissions,
      platform: lambdaPlatformPermissions,
    };
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
   * Getting app record from dynamo
   */
  const queryParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
    Key: {
      'tenant-id': tenantId,
      id: integrationId,
    },
  };

  let dynamoValue;
  let appId;
  try {
    const { Item } = await docClient.get(queryParams).promise();
    /**
     * No record is found, we throw an error
     */
    if (Item) {
      dynamoValue = Item;
      appId = dynamoValue['app-id'];

      if (Item.type !== 'facebook') {
        const errMsg = 'Invalid parameter value, facebookId provided is invalid for this request';

        log.error(errMsg, logContext);

        return {
          status: 400,
          body: { message: errMsg, facebookId: integrationId },
        };
      }
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

    log.error(errMsg, { ...logContext, queryParams }, error);

    return {
      status: 500,
      body: { message: errMsg, queryParams },
    };
  }

  /**
   * Getting keys from secret manager
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
   * Get facebook integration
   */
  let integrationDetail;
  let appKeys;
  try {
    appKeys = JSON.parse(appSecrets.SecretString);
  } catch (error) {
    const errMsg = 'Failed to parse smooch credentials or credentials are empty';
    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  try {
    const { data } = await axios({
      method: 'get',
      url: `https://${SMOOCH_API_URL}/v2/apps/${appId}/integrations/${integrationId}`,
      auth: {
        username: appKeys[`${appId}-id`],
        password: appKeys[`${appId}-secret`],
      },
    });
    integrationDetail = data.integration;
  } catch (error) {
    log.error('Unexpected error occurred getting interaction detail', logContext, error);
    return {
      status: 500,
      body: {
        error: 'Unexpected error occurred getting interaction detail',
      },
    };
  }

  integrationDetail.facebookAppId = integrationDetail.appId;
  integrationDetail.facebookPageId = integrationDetail.pageId;
  delete integrationDetail.appId;
  delete integrationDetail.pageId;
  delete integrationDetail.displayName;
  const result = {
    ...integrationDetail,
    ...string.keysToCamelCase(dynamoValue),
  };

  log.info('get-facebook-integration complete', {
    ...logContext, result,
  });

  return {
    status: 200,
    body: {
      result,
    },
  };
};
