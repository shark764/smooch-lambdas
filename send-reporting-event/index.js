const { lambda: { log } } = require('alonzo');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');

const sns = new AWS.SNS({ apiVersion: '2010-03-31' });

const {
  REGION,
  REGION_PREFIX,
  ENVIRONMENT,
  ACCOUNT_ID,
} = process.env;

const asStringVal = (s) => ({ DataType: 'String', StringValue: s });

exports.handler = async (event) => {
  const {
    tenantId,
    interactionId,
    topic,
    appName,
    resourceId,
  } = JSON.parse(event.Records[0].body);

  const logContext = {
    tenantId,
    interactionId,
    topic,
    resourceId,
  };
  const appId = '55448dde-5fa1-416f-a55a-19537cc63c94';

  let message = {
    'psychopomp/version': `psychopomp.messages.reporting/${topic}`,
    'psychopomp/type': topic,
    'event-id': uuidv4(),
    timestamp: `${new Date(Date.now()).toISOString().split('.').shift()}Z`,
    'app-name': appName,
    'app-id': appId,
    'tenant-id': tenantId,
    'interaction-id': interactionId,
    'agent-id': resourceId,
    'message-id': uuidv4(),
  };

  message = {
    'topic-key': asStringVal(topic),
    'app-name': asStringVal(appName),
    'app-id': asStringVal(appId),
    encoding: asStringVal('application/json'),
    message: asStringVal(JSON.stringify(message)),
  };
  let snsReportingARN;
  switch (topic) {
    case 'agent-message':
      snsReportingARN = `arn:aws:sns:${REGION}:${ACCOUNT_ID}:${REGION_PREFIX}-${ENVIRONMENT}-agent-message`;
      break;
    case 'customer-message':
      snsReportingARN = `arn:aws:sns:${REGION}:${ACCOUNT_ID}:${REGION_PREFIX}-${ENVIRONMENT}-customer-message`;
      break;
    default:
      log.error('Topic received not supported', { ...logContext, topic });
      throw new Error('Topic received not supported');
  }

  const params = {
    Message: 'dist-event',
    TopicArn: snsReportingARN,
    MessageAttributes: message,
  };

  log.debug('Sending reporting event to SNS', { ...logContext, snsParams: params });

  let result;
  try {
    result = await sns.publish(params).promise();
  } catch (error) {
    log.error('Failed to send reporting event', logContext, error);
    throw error;
  }
  log.debug('Sent reporting event', { ...logContext, result });
};
