/**
 * Lambda that creates a smooch web integration
 * */

const AWS = require('aws-sdk');
const Joi = require('joi');
const {
  lambda: {
    log,
    api: { validateTenantPermissions },
  },
} = require('alonzo');
const string = require('serenova-js-utils/strings');
const SmoochCore = require('smooch-core');

const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();

const bodySchema = Joi.object({
  appId: Joi.string()
    .required(),
  contactPoint: Joi.string()
    .required(),
  prechatCapture: Joi.string()
    .required()
    .valid('name', 'email', 'none'),
  name: Joi.string()
    .required(),
  description: Joi.string().allow(''),
  clientDisconnectMinutes: Joi.number().min(1).max(1440).allow(null),
  brandColor: Joi.string(),
  whitelistedUrls: Joi.array()
    .items(Joi.string()),
  businessName: Joi.string().allow(''),
  businessIconUrl: Joi.string().allow(''),
  fixedIntroPane: Joi.boolean(),
  conversationColor: Joi.string(),
  backgroundImageUrl: Joi.string().allow(''),
  actionColor: Joi.string(),
  displayStyle: Joi.string()
    .valid('button', 'tab'),
  buttonWidth: Joi.string(),
  buttonHeight: Joi.string(),
  buttonIconUrl: Joi.string().allow(''),
});
const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

const { REGION_PREFIX, ENVIRONMENT, SMOOCH_API_URL } = process.env;
const lambdaPermissions = ['WEB_INTEGRATIONS_APP_UPDATE'];

exports.handler = async (event) => {
  const { body, params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], userId: identity['user-id'] };

  log.info('create-smooch-web-integration was called', { ...logContext, params, SMOOCH_API_URL });

  /**
   * Validating permissions
   */

  const { 'tenant-id': tenantId } = params;
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
    await bodySchema.validateAsync(body, { abortEarly: false });
  } catch (error) {
    const errMsg = 'Error: invalid body value(s).';
    const validationMessage = error.details
      .map(({ message }) => message)
      .join(' / ');

    log.warn(errMsg, { ...logContext, validationMessage }, error);

    return {
      status: 400,
      body: {
        message: `${errMsg} ${validationMessage}`,
      },
    };
  }

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

  let defaultPrechatCapture;
  if (body.prechatCapture === 'name') {
    defaultPrechatCapture = [{
      type: 'text',
      name: 'name',
      label: 'Name',
      placeholder: '',
      minSize: 1,
      maxSize: 128,
    }];
  } else if (body.prechatCapture === 'email') {
    defaultPrechatCapture = [{
      type: 'email',
      name: 'email',
      label: 'Email',
      placeholder: '',
      minSize: 1,
      maxSize: 128,
    }];
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

  const { appId } = body;
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

  /**
   * Getting smooch integration
   */

  let smoochIntegration;
  try {
    const { integration } = await smooch.integrations.create(appId, {
      type: 'web',
      brandColor: body.brandColor,
      // Set originWhitelist to undefined if array is empty
      originWhitelist: body.whitelistedUrls && body.whitelistedUrls.length === 0
        ? null
        : body.whitelistedUrls,
      businessName: body.businessName,
      businessIconUrl: body.businessIconUrl,
      fixedIntroPane: body.fixedIntroPane,
      integrationOrder: [],
      prechatCapture: body.prechatCapture === 'none'
        ? { enabled: false }
        : { enabled: true, fields: defaultPrechatCapture },
      conversationColor: body.conversationColor,
      backgroundImageUrl: body.backgroundImageUrl,
      actionColor: body.actionColor,
      displayStyle: body.displayStyle,
      buttonWidth: body.buttonWidth,
      buttonHeight: body.buttonHeight,
      buttonIconUrl: body.buttonIconUrl,
    });

    smoochIntegration = integration;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create a web integration for tenant';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg, error },
    };
  }

  /**
   * Setting app records in dynamo
   */

  const {
    name,
    contactPoint,
    description,
    clientDisconnectMinutes,
  } = body;

  let updateExpression = `set #type = :t, #appId = :appId, #contactPoint = :contactPoint,
  #name = :name, #createdBy = :createdBy, #updatedBy = :updatedBy,
  created = :created, updated = :updated`;

  const expressionAttributeNames = {
    '#type': 'type',
    '#appId': 'app-id',
    '#contactPoint': 'contact-point',
    '#createdBy': 'created-by',
    '#updatedBy': 'updated-by',
    '#name': 'name',
  };

  const expressionAttributeValues = {
    ':t': 'web',
    ':appId': appId,
    ':contactPoint': contactPoint,
    ':name': name,
    ':createdBy': identity['user-id'],
    ':updatedBy': identity['user-id'],
    ':created': (new Date()).toISOString(),
    ':updated': (new Date()).toISOString(),
  };

  if (description) {
    updateExpression += ', description = :description';
    expressionAttributeValues[':description'] = description;
  }

  if (clientDisconnectMinutes) {
    updateExpression += ', #clientDisconnectMinutes = :clientDisconnectMinutes';
    expressionAttributeNames['#clientDisconnectMinutes'] = 'client-disconnect-minutes';
    expressionAttributeValues[':clientDisconnectMinutes'] = clientDisconnectMinutes;
  }

  const updateParams = {
    TableName: `${REGION_PREFIX}-${ENVIRONMENT}-smooch`,
    Key: { 'tenant-id': tenantId, id: smoochIntegration._id },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  };

  let dynamoValue;

  log.debug('Creating record in DynamoDB', { ...logContext, updateParams });
  try {
    const { Attributes } = await docClient.update(updateParams).promise();
    dynamoValue = Attributes;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to save a record in DynamoDB for tenant';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg, error },
    };
  }

  if (smoochIntegration.brandColor) {
    smoochIntegration.brandColor = `#${smoochIntegration.brandColor}`;
  }
  if (smoochIntegration.conversationColor) {
    smoochIntegration.conversationColor = `#${smoochIntegration.conversationColor}`;
  }
  if (smoochIntegration.actionColor) {
    smoochIntegration.actionColor = `#${smoochIntegration.actionColor}`;
  }

  const dynamoValueCased = {};

  delete dynamoValue.type;
  delete smoochIntegration.integrationOrder;
  delete smoochIntegration._id;
  delete smoochIntegration.displayName;
  delete smoochIntegration.status;
  delete smoochIntegration.type;
  smoochIntegration.whitelistedUrls = smoochIntegration.originWhitelist;
  delete smoochIntegration.originWhitelist;
  smoochIntegration.prechatCapture = body.prechatCapture !== 'none' ? smoochIntegration.prechatCapture.fields[0].name : 'none';
  Object.keys(dynamoValue).forEach((v) => {
    dynamoValueCased[string.kebabCaseToCamelCase(v)] = dynamoValue[v];
  });

  const result = {
    ...smoochIntegration,
    ...dynamoValueCased,
  };

  log.info('user created a new smooch integration', {
    userId: identity['user-id'],
    tenantId,
    smoochIntegrationId: smoochIntegration.id,
    auditData: Object.keys(body),
    audit: true,
  });
  log.info('create-smooch-web-integration complete', { ...logContext, result });

  return {
    status: 201,
    body: { result },
  };
};
