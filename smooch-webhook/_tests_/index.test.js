
global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
  smooch_api_url: 'mock-amooch-api-url',
};

const mockGet = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({ Item: { InteractionId: '1' } }),
  }));

const mockGetSecretValue = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({
      SecretString: JSON.stringify({
        id: 'mock-secret-id',
        secret: 'mock-secret',
      }),
    }),
  }));

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: jest.fn().mockImplementation(() => ({ promise: jest.fn().mockImplementation(() => ({ QueueUrl: 'url://testurl' })) })),
    sendMessage: jest.fn(), // mockSendMessage,
  })),
  DynamoDB: {
    DocumentClient: jest.fn().mockImplementation(() => ({
      get: mockGet,
      put: jest.fn(), // mockPut,
      update: jest.fn(), // mockUpdate,
    })),
  },
  SecretsManager: jest.fn().mockImplementation(() => ({
    getSecretValue: mockGetSecretValue,
  })),
}));

const index = require('../index');

const { handler } = index;

const body = {
  app: {
    _id: 'mock-smooch-app-id',
  },
  appUser: {
    _id: 'mock-app-user-id',
    properties: {
      tenantId: 'mock-tenant-id',
    },
  },
  client: {
    integrationId: 'mock-integration-id',
    platform: 'web',
  },
  timestamp: 'mock-timestamp',
};

const event = (bodyParam = body) => ({
  Records: [{
    body: JSON.stringify(bodyParam),
  }],
});

describe('smooch-webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('handler', () => {
    it('continues when there are more than one record', async () => {
      const eventWithMultipleRecords = event();
      eventWithMultipleRecords.Records.push('mock multiple record');
      await handler(eventWithMultipleRecords);
    });
    it('returns when there is no client', async () => {
      const bodyWithoutClient = { ...body };
      delete bodyWithoutClient.client;
      const result = await handler(event(bodyWithoutClient));
      expect(result).toEqual('no client');
    });
    describe('walkthrough', () => {
      beforeEach(async () => {
        await handler(event());
      });
      it('calls getSecretValue correctly', async () => {
        expect(mockGetSecretValue.mock.calls).toMatchSnapshot();
      });
      it('calls docClient.get correctly', async () => {
        expect(mockGet.mock.calls).toMatchSnapshot();
      });
    });
    describe('message:appUser', () => {
      // TODO refactor handler
    });
    describe('conversation:read', () => {
      it('returns when no interaction', async () => {
        mockGet.mockImplementationOnce(() => ({
          promise: () => undefined,
        }));
        const result = await handler(event({
          ...body,
          trigger: 'conversation:read',
        }));
        expect(result).toEqual('conversation:read no interaction');
      });
      it('calls sendConversationEvent correctly', async () => {
        const sendConversationEvent = jest.spyOn(index, 'sendConversationEvent')
          .mockImplementationOnce(() => { });
        await handler(event({
          ...body,
          trigger: 'conversation:read',
        }));
        expect(sendConversationEvent.mock.calls).toMatchSnapshot();
      });
    });
    describe('typing:appUser', () => {
      it('returns when no interaction', async () => {
        mockGet.mockImplementationOnce(() => ({
          promise: () => undefined,
        }));
        const result = await handler(event({
          ...body,
          trigger: 'typing:appUser',
        }));
        expect(result).toEqual('typing:appUser no interaction');
      });
      it('calls sendConversationEvent correctly', async () => {
        const sendConversationEvent = jest.spyOn(index, 'sendConversationEvent')
          .mockImplementationOnce(() => { });
        await handler(event({
          ...body,
          trigger: 'typing:appUser',
          activity: {
            type: 'typing:start',
          },
        }));
        expect(sendConversationEvent.mock.calls).toMatchSnapshot();
      });
      it('uses typing-stop', async () => {
        const sendConversationEvent = jest.spyOn(index, 'sendConversationEvent')
          .mockImplementationOnce(() => { });
        await handler(event({
          ...body,
          trigger: 'typing:appUser',
          activity: {
            type: 'typing:stop',
          },
        }));
        expect(sendConversationEvent.mock.calls[0][0].conversationEvent).toEqual('typing-stop');
      });
    });
    it('returns for unsupported triggers', async () => {
      const result = await handler(event({
        ...body,
        trigger: 'bogus trigger',
      }));
      expect(result).toEqual('unsupported trigger');
    });
  });
});
