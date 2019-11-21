/**
 * Lambda that creates an smooch web integration
 * */

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const log = require('serenova-js-utils/lambda/log');
const string = require('serenova-js-utils/strings');
const SmoochCore = require('smooch-core');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const bodySchema = Joi.object({
  appId: Joi.string()
    .required(),
  contactPoint: Joi.string()
    .required(),
  prechatCapture: Joi.string()
    .required()
    .valid('name', 'email'),
  name: Joi.string()
    .required(),
  description: Joi.string(),

  brandColor: Joi.string(),

  originWhiteList: Joi.array()
    .items(Joi.string()),

  businessName: Joi.string(),

  businessIconUrl: Joi.string(),

  fixedIntroPane: Joi.boolean(),

  conversationColor: Joi.string(),

  backgroundImageUrl: Joi.string(),

  actionColor: Joi.string(),

  displayStyle: Joi.string()
    .valid('button', 'tab'),

  buttonWidth: Joi.string(),

  buttonHeight: Joi.string(),

  buttonIconUrl: Joi.string(),
});
const paramsSchema = Joi.object({
  'tenant-id': Joi.string().guid(),
  'user-id': Joi.any(),
  'remote-addr': Joi.any(),
  auth: Joi.any(),
});

exports.handler = async (event) => {
  const { AWS_REGION, ENVIRONMENT } = process.env;
  const { body, params, identity } = event;
  const logContext = { tenantId: params['tenant-id'], smoochUserId: identity['user-id'] };

  log.info('create-smooch-web-integration was called', { ...logContext, params });

  try {
    await bodySchema.validateAsync(body);
  } catch (error) {
    const errMsg = 'Error: invalid body value';

    log.warn(errMsg, { ...logContext, validationMessage: error.details[0].message }, error);

    return {
      status: 400,
      body: { message: `${errMsg} ${error.details[0].message}` },
    };
  }

  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    const errMsg = 'Error: invalid params';

    log.warn(errMsg, { ...logContext, validationMessage: error.details[0].message }, error);

    return {
      status: 400,
      body: { message: `${errMsg} ${error.details[0].message}` },
    };
  }

  const { 'tenant-id': tenantId } = params;
  const { appId, contactPoint } = body;
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
  } else {
    const errMsg = 'Bad request: body.prechatCapture invalid value';

    log.warn(errMsg, logContext);

    return {
      status: 400,
      body: { message: errMsg },
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

  let smooch;
  try {
    const appKeys = JSON.parse(appSecrets.SecretString);
    smooch = new SmoochCore({
      keyId: appKeys[`${appId}-id`],
      secret: appKeys[`${appId}-secret`],
      scope: 'app',
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
    const { integration } = await smooch.integrations.create(appId, {
      type: 'web',
      brandColor: body.brandColor,
      originWhiteList: body.originWhiteList,
      businessName: body.businessName,
      businessIconUrl: body.businessIconUrl,
      fixedIntroPane: body.fixedIntroPane,
      integrationOrder: [],
      prechatCapture: { enabled: true, fields: defaultPrechatCapture },
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

  const updateParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    Key: { 'tenant-id': tenantId, id: smoochIntegration._id },
    UpdateExpression: `set #type = :t, #appId = :appId, #contactPoint = :contactPoint,
    #name = :name, description = :description, #createdBy = :createdBy, #updatedBy = :updatedBy,
    created = :created, updated = :updated`,
    ExpressionAttributeNames: {
      '#type': 'type',
      '#appId': 'app-id',
      '#contactPoint': 'contact-point',
      '#createdBy': 'created-by',
      '#updatedBy': 'updated-by',
      '#name': 'name',
    },
    ExpressionAttributeValues: {
      ':t': 'web',
      ':appId': appId,
      ':contactPoint': contactPoint,
      ':name': body.name,
      ':description': body.description,
      ':createdBy': identity['user-id'],
      ':updatedBy': identity['user-id'],
      ':created': (new Date()).toISOString(),
      ':updated': (new Date()).toISOString(),
    },
    ReturnValues: 'ALL_NEW',
  };

  let dynamoValue;

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

  const dynamoValueCased = {};

  delete smoochIntegration.integrationOrder;
  delete smoochIntegration._id;
  delete dynamoValue.type;
  delete smoochIntegration.displayName;
  delete smoochIntegration.status;
  smoochIntegration.prechatCapture = smoochIntegration.prechatCapture.fields[0].name;
  Object.keys(dynamoValue).forEach((v) => {
    dynamoValueCased[string.kebabCaseToCamelCase(v)] = dynamoValue[v];
  });

  const result = {
    ...smoochIntegration,
    ...dynamoValueCased,
  };

  log.info('create-smooch-web-integration complete', { ...logContext, result });

  return {
    status: 201,
    body: { result },
  };
};
