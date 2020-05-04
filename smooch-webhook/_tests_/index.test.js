const axios = require('axios');

jest.mock('axios');
jest.mock('smooch-core');

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

const mockSmoochUpdate = jest.fn();

const mockSendMessage = jest.fn()
  .mockImplementation(() => ({
    promise: () => ({}),
  }));

const mockSmoochCore = jest.fn(() => ({
  appUsers: {
    update: mockSmoochUpdate,
  },
}));

jest.mock('smooch-core', () => mockSmoochCore);

jest.mock('aws-sdk', () => ({
  config: {
    update: jest.fn(),
  },
  SQS: jest.fn().mockImplementation(() => ({
    getQueueUrl: jest.fn().mockImplementation(() => ({ promise: jest.fn().mockImplementation(() => ({ QueueUrl: 'url://testurl' })) })),
    sendMessage: mockSendMessage, // mockSendMessage,
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

axios.mockImplementation(() => ({
  data: {
    collectActions: [{
      actionId: 'actionId',
    }],
    participants: [],
  },
}));

const index = require('../index');

const { handler, handleFormResponse } = index;

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
      describe('handleFormResponse', () => {
        const spyOnCreateInteraction = jest.spyOn(index, 'createInteraction');
        const spyOnHandleCollectMessageResponse = jest.spyOn(index, 'handleCollectMessageResponse');

        const input = {
          appId: 'mock-app-id',
          userId: 'mock-user-id',
          integrationId: 'mock-integration-id',
          tenantId: 'mock-tenant-id',
          interactionId: 'mock-interaction-id',
          form: {
            name: 'Web User ',
            type: 'formResponse',
            fields: [{
              text: 'example',
            }],
            _id: '_id',
            received: '10',
          },
          auth: 'auth',
          logContext: '',
        };

        describe('prechat capture', () => {
          it('passes in the correct arguments to createInteraction()', async () => {
            await handleFormResponse(input);
            expect(spyOnCreateInteraction.mock.calls).toMatchSnapshot();
          });

          it('when prechat form is submitted with no customer indentifier', async () => {
            const mockInput = {
              ...input,
              form: {
                name: 'Web User ',
                fields: [],
              },
            };
            await handleFormResponse(mockInput);
          });

          it('throws an error when there problem retrieving digital channels credentials', async () => {
            mockGetSecretValue.mockRejectedValueOnce(new Error());
            try {
              await handleFormResponse(input);
            } catch (error) {
              expect(Promise.reject(new Error('An Error has occurred trying to retrieve digital channels credentials (form getSecretValue())'))).rejects.toThrowErrorMatchingSnapshot();
            }
          });

          it('throws an error when there problem retrieving digital channels credentials (form SmoochCore)', async () => {
            mockSmoochCore.mockImplementationOnce(() => {
              throw new Error();
            });
            try {
              await handleFormResponse(input);
            } catch (error) {
              expect(Promise.reject(new Error('An Error has occurred trying to retrieve digital channels credentials'))).rejects.toThrowErrorMatchingSnapshot();
            }
          });

          it('throws an error when there problem updating Smooch appUser', async () => {
            mockSmoochUpdate.mockRejectedValueOnce(new Error());
            try {
              await handleFormResponse(input);
            } catch (error) {
              expect(Promise.reject(new Error('Error updating Smooch appUser'))).rejects.toThrowErrorMatchingSnapshot();
            }
          });

          it('throws an error when there is a problem creating interaction', async () => {
            spyOnCreateInteraction.mockImplementationOnce(() => { throw new Error(); });
            try {
              await handleFormResponse(input);
            } catch (error) {
              expect(Promise.reject(new Error('Failed to create an interaction'))).rejects.toThrowErrorMatchingSnapshot();
            }
          });
        });

        describe('collect message response', () => {
          it('passes in the correct arguments to handleCollectMessageResponse()', async () => {
            const mockInput = {
              ...input,
              form: {
                name: 'Web',
                type: 'formResponse',
                fields: [{
                  text: 'example',
                  name: 'collect-message',
                }],
                _id: '_id',
                received: '10',
                quotedMessage: {
                  content: {
                    metadata: {
                      actionId: 'actionId',
                      subId: 'subId',
                    },
                  },
                },
              },
            };
            await handleFormResponse(mockInput);
            expect(spyOnHandleCollectMessageResponse.mock.calls).toMatchSnapshot();
          });

          it('breaks when receives an unsupported formResponse', async () => {
            const mockInput = {
              ...input,
              form: {
                name: 'mock-form-name',
                fields: [{
                  name: 'mock-name',
                }],
              },
            };
            const result = await handleFormResponse(mockInput);
            expect(result).toEqual('unsupported formresponse');
          });
        });
      });
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
