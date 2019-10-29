/**
 * Lambda that creates an smooch web integration
 * */

const AWS = require('aws-sdk');
const Joi = require('@hapi/joi');
const axios = require('axios');

AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = new AWS.DynamoDB.DocumentClient();
const secretsClient = new AWS.SecretsManager();
const bodySchema = Joi.object({
  appId: Joi.string()
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
  console.log('create-smooch-web-integration', JSON.stringify(event));
  console.log('create-smooch-web-integration', JSON.stringify(process.env));

  const { AWS_REGION, ENVIRONMENT } = process.env;
  const { body, params, identity } = event;
  try {
    await bodySchema.validateAsync(body);
  } catch (error) {
    console.warn(`Error: invalid body value ${error.details[0].message}`);

    return {
      status: 400,
      body: { message: `Error: invalid body value ${error.details[0].message}` },
    };
  }

  try {
    await paramsSchema.validateAsync(params);
  } catch (error) {
    console.warn(`Error: invalid params value ${error.details[0].message}`);

    return {
      status: 400,
      body: { message: `Error: invalid params value ${error.details[0].message}` },
    };
  }

  const { 'tenant-id': tenantId } = params;
  const { appId } = body;
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
    return {
      status: 400,
      body: { message: `Bad request: body.prechatCapture invalid value ${body.prechatCapture}` },
    };
  }

  let appSecrets;
  try {
    appSecrets = await secretsClient.getSecretValue({
      SecretId: `${AWS_REGION}/${ENVIRONMENT}/cxengage/smooch/app`,
    }).promise();
  } catch (error) {
    console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return {
      status: 500,
      body: { message: 'An Error has occurred trying to retrieve digital channels credentials' },
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
    console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return {
      status: 500,
      body: { message: `An Error has occurred trying to create a web integration for tenant ${tenantId}`, error },
    };
  }

  const createParams = {
    TableName: `${AWS_REGION}-${ENVIRONMENT}-smooch`,
    Item: {
      'tenant-id': tenantId,
      id: integration.integration._id,
      'app-id': appId,
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
    console.error(JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return {
      status: 500,
      body: { message: `An Error has occurred trying to save a record in DynamoDB for tenant ${tenantId}`, error },
    };
  }

  return {
    status: 201,
    body: integration,
  };
};
