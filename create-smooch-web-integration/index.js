/**
 * Lambda that creates an smooch web integration
 * */

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const axios = require('axios');
const log = require('serenova-js-utils/lambda/log');

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

  log.info('create-smooch-web-integration was called', logContext);

  try {
    await bodySchema.validateAsync(body);
  } catch (error) {
    const errMsg = 'Error: invalid body value';

    log.warn(errMsg, { ...logContext, validationMessage: error.details[0].message }, error);

    return {
      status: 400,
      body: { message: errMsg },
    };
  }

  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    const errMsg = 'Error: invalid params';

    log.warn(errMsg, { ...logContext, validationMessage: error.details[0].message }, error);

    return {
      status: 400,
      body: { message: errMsg },
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

  const appKeys = JSON.parse(appSecrets.SecretString);
  const smoochApiUrl = `https://api.smooch.io/v1.1/apps/${appId}/integrations`;
  let integration;
  try {
    const res = await axios.post(smoochApiUrl, {
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
    },
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${appKeys[`${appId}-id`]}:${appKeys[`${appId}-secret`]}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });
    integration = res.data;
  } catch (error) {
    const errMsg = 'An Error has occurred trying to create a web integration for tenant';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg, error },
    };
  }

  const createParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    Item: {
      'tenant-id': tenantId,
      id: integration.integration._id,
      'app-id': appId,
      'contact-point': contactPoint,
      type: 'web',
      name: body.name,
      description: body.description,
      'created-by': identity['user-id'],
      'updated-by': identity['user-id'],
      created: (new Date()).toISOString(),
      updated: (new Date()).toISOString(),
    },
  };
  try {
    await docClient.put(createParams).promise();
  } catch (error) {
    const errMsg = 'An Error has occurred trying to save a record in DynamoDB for tenant';

    log.error(errMsg, logContext, error);

    return {
      status: 500,
      body: { message: errMsg, error },
    };
  }

  log.info('create-smooch-web-integration complete', { ...logContext, integration });

  return {
    status: 201,
    body: integration,
  };
};
