/**
 * Lambda that gets a web integration from Smooch
 */

const AWS = require('aws-sdk');
const Joi = require('joi');
const {
  lambda: {
    log,
    api: { validateTenantPermissions, validatePlatformPermissions },
  },
} = require('alonzo');

const docClient = new AWS.DynamoDB.DocumentClient();

const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid().required(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});
const lambdaPermissions = ['WEB_INTEGRATIONS_APP_READ'];
const lambdaPlatformPermissions = ['PLATFORM_VIEW_ALL'];

const { REGION_PREFIX, ENVIRONMENT } = process.env;

exports.handler = async (event) => {
  const { params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], userId: identity['user-id'] };
  const { 'tenant-id': tenantId } = params;
  log.info('get-smooch-web-integrations was called', { ...logContext, params });

  /**
   * Validating permissions
   */

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

  /**
   * Getting apps records from dynamo
   */

  const queryParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
    KeyConditionExpression: '#tenantId = :t and #integrationType = :type',
    IndexName: 'tenant-id-type-index',
    ExpressionAttributeNames: {
      '#tenantId': 'tenant-id',
      '#integrationType': 'type',
    },
    ExpressionAttributeValues: {
      ':t': tenantId,
      ':type': 'web',
    },
  };
  let smoochIntegrations;

  try {
    const queryResponse = await docClient.query(queryParams).promise();
    smoochIntegrations = queryResponse.Items;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to fetch integrations in DynamoDB';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg },
    };
  }

  // Remove `type` from records
  smoochIntegrations = smoochIntegrations.map(({ type, ...otherAttrs }) => otherAttrs);

  log.info('get-smooch-web-integrations complete', logContext);

  return {
    status: 200,
    body: { result: smoochIntegrations },
  };
};
